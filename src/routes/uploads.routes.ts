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
<<<<<<< HEAD
const LOCAL_TEST_DIR = path.join(__dirname, "uploads"); // em dev
const PROD_DIR = "/uploads";  // em prod (Railway)
=======
const LOCAL_TEST_DIR = path.join(process.cwd(), "uploads"); // em dev
const DEFAULT_PROD_DIR = fs.existsSync("/uploads") ? "/uploads" : path.join(process.cwd(), "uploads");
const PROD_DIR = process.env.UPLOAD_DIR ?? DEFAULT_PROD_DIR; // em prod (Railway)
>>>>>>> b5a480af518dd2899b73bfba67ce5cec5ce864d5

const UPLOAD_DIR = isProd ? PROD_DIR : LOCAL_TEST_DIR;

fs.mkdirSync(PROD_DIR, { recursive: true });

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

function sanitizeCnesForMatch(value: unknown) {
  const onlyDigits = String(value ?? "").replace(/\D+/g, "");
  return onlyDigits.length ? onlyDigits : "";
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

    const baseList = files
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((filename) => {
        const fullPath = path.join(UPLOAD_DIR, filename);
        const st = fs.statSync(fullPath);

        // ✅ agora aceita CNES de qualquer formato/tamanho
        // pega tudo entre "__CNES-" e "__"
        const match = filename.match(/__CNES-(.+?)__/);
        const cnesFromFileSafe = match?.[1] ?? null;
        const cnesForMatch = cnesFromFileSafe ? sanitizeCnesForMatch(cnesFromFileSafe) : null;

        // OBS: no nome do arquivo foi salvo como cnesSafe, não necessariamente igual ao cnes real
        // (pq trocamos caracteres perigosos por "_")
        // Então para enriquecimento no banco, só faz sentido se o CNES for “texto compatível” com o banco.
        // Se o seu CNES do banco é somente números, o ideal é CNES numérico no front/back.
        const cnes = cnesFromFileSafe;

        return {
          filename,
          cnes,
          cnes_match: cnesForMatch,
          sizeKB: Number((st.size / 1024).toFixed(2)),
          createdAt: st.birthtime,
          url: `/uploads/${encodeURIComponent(filename)}`,
        };
      });

    // ✅ sem filtro por tamanho
    const cnesList = Array.from(
      new Set(baseList.map((x) => x.cnes_match).filter((x): x is string => !!x))
    );

    let metaByCnes: Record<
      string,
      { estabelecimento: string; municipio: string; uf: string; ibge: string; nivel_gestao: string | null }
    > = {};

    if (cnesList.length > 0) {
      const result = await pool.query(
        `
        SELECT
          e.cnes::text as cnes,
          e.nome AS estabelecimento,
          m.nome AS municipio,
          m.ibge,
          es.uf,
          e.nivel_gestao
        FROM recursos.estabelecimentos e
        JOIN recursos.municipios m ON m.id = e.municipio_id
        JOIN recursos.estados es   ON es.id = m.estado_id
        WHERE NULLIF(regexp_replace(e.cnes::text, '\\D', '', 'g'), '')::numeric = ANY($1::numeric[])
        `,
        [cnesList]
      );

      for (const r of result.rows) {
        const key = sanitizeCnesForMatch(r.cnes);
        metaByCnes[key] = {
          estabelecimento: r.estabelecimento,
          municipio: r.municipio,
          uf: r.uf,
          ibge: r.ibge,
          nivel_gestao: r.nivel_gestao ?? null,
        };
      }
    }

    const pdfs = baseList.map((p) => {
      const meta = p.cnes_match ? metaByCnes[p.cnes_match] : undefined;
      return {
        ...p,
        cnes_match: undefined,
        estabelecimento: meta?.estabelecimento ?? null,
        municipio: meta?.municipio ?? null,
        uf: meta?.uf ?? null,
        ibge: meta?.ibge ?? null,
        nivel_gestao: meta?.nivel_gestao ?? null,
      };
    });

    return res.json({ ok: true, total: pdfs.length, files: pdfs });
  } catch (e: any) {
    console.error("Erro ao listar arquivos:", e);
    return res.status(500).json({ ok: false, message: "Erro ao listar arquivos" });
  }
});

export default router;
