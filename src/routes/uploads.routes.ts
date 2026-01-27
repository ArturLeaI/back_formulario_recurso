import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pool } from "../db/pool";

const router = Router();

const isProd =
  process.env.RAILWAY_ENVIRONMENT === "production" || process.env.NODE_ENV === "production";

// ✅ paths absolutos e consistentes
const LOCAL_TEST_DIR = path.join(process.cwd(), "uploads"); // em dev
const DEFAULT_PROD_DIR = fs.existsSync("/uploads") ? "/uploads" : path.join(process.cwd(), "uploads");
const PROD_DIR = process.env.UPLOAD_DIR ?? DEFAULT_PROD_DIR; // em prod (Railway)

const UPLOAD_DIR = isProd ? PROD_DIR : LOCAL_TEST_DIR;
const ASSINADOS_FILE = path.join(UPLOAD_DIR, "assinados.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * ✅ CNES: NÃO normaliza, NÃO valida tamanho, NÃO restringe a números.
 * Regra: só precisa existir (não vazio).
 */
function isValidCNES(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function sanitizeBaseName(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w\s()-]/g, "")
    .replace(/\s+/g, "_")
    .trim();

  return (base || "arquivo").slice(0, 80);
}

function readAssinados(): Record<string, boolean> {
  try {
    if (!fs.existsSync(ASSINADOS_FILE)) return {};
    const raw = fs.readFileSync(ASSINADOS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeAssinados(map: Record<string, boolean>) {
  const tmp = `${ASSINADOS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
  fs.renameSync(tmp, ASSINADOS_FILE);
}

function replaceCnesInFilename(filename: string, cnesSafe: string) {
  const ext = path.extname(filename) || ".pdf";
  const base = path.basename(filename, ext);
  const match = base.match(/^(.*)__CNES-(.+?)__(\d+)$/);

  if (match) {
    const prefix = match[1] || "arquivo";
    const ts = match[3] || String(Date.now());
    return `${prefix}__CNES-${cnesSafe}__${ts}${ext}`;
  }

  return `${base}__CNES-${cnesSafe}__${Date.now()}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".pdf").toLowerCase();
    cb(null, `tmp-${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
      return cb(new Error("Apenas PDF é permitido"));
    }
    cb(null, true);
  },
});

// POST /uploads  (form-data: file + cnes)
router.post("/", upload.single("file"), (req, res) => {
  try {
    const cnes = String(req.body?.cnes ?? "").trim();

    // ✅ NÃO valida tamanho, apenas exige que exista
    if (!isValidCNES(cnes)) {
      // limpa tmp se existir
      if (req.file?.filename) {
        const tmpPath = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
      return res.status(400).json({ ok: false, message: "CNES é obrigatório" });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Arquivo não recebido" });
    }

    const originalBase = sanitizeBaseName(req.file.originalname);
    const ext = (path.extname(req.file.originalname) || ".pdf").toLowerCase();

    // ✅ CNES pode ter vários formatos/tamanhos → preservar como veio
    // Mas precisamos evitar caracteres perigosos no NOME DO ARQUIVO.
    // Então: no filename, substitui caracteres que podem quebrar path.
    const cnesSafe = cnes.replace(/[^\w.-]/g, "_");

    const finalName = `${originalBase}__CNES-${cnesSafe}__${Date.now()}${ext}`;

    const oldPath = path.join(UPLOAD_DIR, req.file.filename);
    const newPath = path.join(UPLOAD_DIR, finalName);
    fs.renameSync(oldPath, newPath);

    return res.status(201).json({
      ok: true,
      filename: finalName,
      originalname: req.file.originalname,
      cnes, // ✅ valor real enviado (sem normalização)
      url: `/uploads/${encodeURIComponent(finalName)}`,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro no upload" });
  }
});

// ✅ GET /uploads/assinados — mapa de assinados (compartilhado)
router.get("/assinados", (_req, res) => {
  try {
    const map = readAssinados();
    return res.json({ ok: true, map });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro ao ler assinados" });
  }
});

// ✅ POST /uploads/assinados — atualiza status de um arquivo
router.post("/assinados", (req, res) => {
  try {
    const filename = String(req.body?.filename ?? "").trim();
    const assinado = Boolean(req.body?.assinado);

    if (!filename) {
      return res.status(400).json({ ok: false, message: "filename é obrigatório" });
    }

    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ ok: false, message: "Nome de arquivo inválido" });
    }

    if (!filename.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ ok: false, message: "Apenas PDF" });
    }

    const map = readAssinados();
    map[filename] = assinado;
    writeAssinados(map);

    return res.json({ ok: true, filename, assinado });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro ao salvar assinado" });
  }
});

// ✅ POST /uploads/metadata — atualizar CNES do arquivo
router.post("/metadata", (req, res) => {
  try {
    const filename = String(req.body?.filename ?? "").trim();
    const cnes = String(req.body?.cnes ?? "").trim();

    if (!filename) {
      return res.status(400).json({ ok: false, message: "filename é obrigatório" });
    }

    if (!isValidCNES(cnes)) {
      return res.status(400).json({ ok: false, message: "CNES é obrigatório" });
    }

    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ ok: false, message: "Nome de arquivo inválido" });
    }

    if (!filename.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ ok: false, message: "Apenas PDF" });
    }

    const currentPath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(currentPath)) {
      return res.status(404).json({ ok: false, message: "Arquivo não encontrado" });
    }

    const cnesSafe = cnes.replace(/[^\w.-]/g, "_");
    let newFilename = replaceCnesInFilename(filename, cnesSafe);
    let newPath = path.join(UPLOAD_DIR, newFilename);

    if (fs.existsSync(newPath)) {
      const ext = path.extname(newFilename) || ".pdf";
      const base = path.basename(newFilename, ext);
      newFilename = `${base}__${Date.now()}${ext}`;
      newPath = path.join(UPLOAD_DIR, newFilename);
    }

    fs.renameSync(currentPath, newPath);

    const map = readAssinados();
    if (map[filename] !== undefined) {
      map[newFilename] = map[filename];
      delete map[filename];
      writeAssinados(map);
    }

    return res.json({ ok: true, filename: newFilename, cnes });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Erro ao atualizar metadado" });
  }
});

// ✅ DELETE /uploads/:filename — excluir PDF
router.delete("/:filename", (req, res) => {
  try {
    const decoded = decodeURIComponent(String(req.params.filename || ""));

    if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
      return res.status(400).json({ ok: false, message: "Nome de arquivo inválido" });
    }

    if (!decoded.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ ok: false, message: "Apenas PDF" });
    }

    const filePath = path.join(UPLOAD_DIR, decoded);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, message: "Arquivo não encontrado" });
    }

    fs.unlinkSync(filePath);

    const map = readAssinados();
    if (map[decoded] !== undefined) {
      delete map[decoded];
      writeAssinados(map);
    }

    return res.json({ ok: true, filename: decoded });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro ao excluir PDF" });
  }
});

// ✅ GET /uploads/:filename — visualizar/baixar PDF (INLINE)
router.get("/:filename", (req, res) => {
  try {
    const decoded = decodeURIComponent(String(req.params.filename || ""));

    if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
      return res.status(400).json({ ok: false, message: "Nome de arquivo inválido" });
    }

    if (!decoded.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ ok: false, message: "Apenas PDF" });
    }

    const filePath = path.join(UPLOAD_DIR, decoded);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, message: "Arquivo não encontrado" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(decoded)}"`);

    return res.sendFile(filePath);
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro ao abrir PDF" });
  }
});
// ✅ GET /uploads — listar PDFs (ENRIQUECIDO com municipio/uf)
router.get("/", async (_req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const assinadosMap = readAssinados();

    const baseList = files
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((filename) => {
        const fullPath = path.join(UPLOAD_DIR, filename);
        const st = fs.statSync(fullPath);

        // ✅ agora aceita CNES de qualquer formato/tamanho
        // pega tudo entre "__CNES-" e "__"
        const match = filename.match(/__CNES-(.+?)__/);
        const cnesFromFileSafe = match?.[1] ?? null;

        // OBS: no nome do arquivo foi salvo como cnesSafe, não necessariamente igual ao cnes real
        // (pq trocamos caracteres perigosos por "_")
        // Então para enriquecimento no banco, só faz sentido se o CNES for “texto compatível” com o banco.
        // Se o seu CNES do banco é somente números, o ideal é CNES numérico no front/back.
        const cnes = cnesFromFileSafe;

        return {
          filename,
          cnes,
          sizeKB: Number((st.size / 1024).toFixed(2)),
          createdAt: st.birthtime,
          url: `/uploads/${encodeURIComponent(filename)}`,
          assinado: Boolean(assinadosMap[filename]),
        };
      });

    // ✅ sem filtro por tamanho
    const cnesList = Array.from(new Set(baseList.map((x) => x.cnes).filter((x): x is string => !!x)));

    let metaByCnes: Record<string, { estabelecimento: string; municipio: string; uf: string; ibge: string }> = {};

    if (cnesList.length > 0) {
      const result = await pool.query(
        `
        SELECT
          e.cnes::text as cnes,
          e.nome AS estabelecimento,
          m.nome AS municipio,
          m.ibge,
          es.uf
        FROM recursos.estabelecimentos e
        JOIN recursos.municipios m ON m.id = e.municipio_id
        JOIN recursos.estados es   ON es.id = m.estado_id
        WHERE e.cnes::text = ANY($1::text[])
        `,
        [cnesList]
      );

      for (const r of result.rows) {
        metaByCnes[String(r.cnes)] = {
          estabelecimento: r.estabelecimento,
          municipio: r.municipio,
          uf: r.uf,
          ibge: r.ibge,
        };
      }
    }

    const pdfs = baseList.map((p) => {
      const meta = p.cnes ? metaByCnes[p.cnes] : undefined;
      return {
        ...p,
        estabelecimento: meta?.estabelecimento ?? null,
        municipio: meta?.municipio ?? null,
        uf: meta?.uf ?? null,
        ibge: meta?.ibge ?? null,
      };
    });

    return res.json({ ok: true, total: pdfs.length, files: pdfs });
  } catch (e: any) {
    console.error("Erro ao listar arquivos:", e);
    return res.status(500).json({ ok: false, message: "Erro ao listar arquivos" });
  }
});

export default router;
