import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pool } from "../db/pool";

const router = Router();

const isProd = process.env.RAILWAY_ENVIRONMENT === "production";

// ✅ paths absolutos e consistentes
const LOCAL_TEST_DIR = path.join(__dirname, "/uploads");        // ex: src/uploads (depende de build)
const PROD_DIR = path.join(process.cwd(), "uploads");            // ex: /app/uploads no Railway

const UPLOAD_DIR = isProd ? PROD_DIR : LOCAL_TEST_DIR;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function isValidCNES(value: unknown) {
  return typeof value === "string" && /^\d{7}$/.test(value);
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
    if (
      file.mimetype !== "application/pdf" &&
      !file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      return cb(new Error("Apenas PDF é permitido"));
    }
    cb(null, true);
  },
});

// POST /uploads  (form-data: file + cnes)
router.post("/", upload.single("file"), (req, res) => {
  try {
    const cnes = String(req.body?.cnes ?? "").trim();

    if (!isValidCNES(cnes)) {
      if (req.file?.filename) {
        const tmpPath = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
      return res.status(400).json({ ok: false, message: "CNES inválido (7 dígitos)" });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Arquivo não recebido" });
    }

    const originalBase = sanitizeBaseName(req.file.originalname);
    const ext = (path.extname(req.file.originalname) || ".pdf").toLowerCase();
    const finalName = `${originalBase}__CNES-${cnes}__${Date.now()}${ext}`;

    const oldPath = path.join(UPLOAD_DIR, req.file.filename);
    const newPath = path.join(UPLOAD_DIR, finalName);
    fs.renameSync(oldPath, newPath);

    return res.status(201).json({
      ok: true,
      filename: finalName,
      originalname: req.file.originalname,
      cnes,
      url: `/uploads/${encodeURIComponent(finalName)}`,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Erro no upload" });
  }
});

// ✅ GET /uploads/:filename — visualizar/baixar PDF (INLINE)
router.get("/:filename", (req, res) => {
  try {
    // ✅ decode primeiro
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

        const match = filename.match(/__CNES-(\d{7})__/);
        const cnes = match?.[1] ?? null;

        return {
          filename,
          cnes,
          sizeKB: Number((st.size / 1024).toFixed(2)),
          createdAt: st.birthtime,
          url: `/uploads/${encodeURIComponent(filename)}`,
        };
      });

    const cnesList = Array.from(
      new Set(baseList.map((x) => x.cnes).filter((x): x is string => !!x && /^\d{7}$/.test(x)))
    );

    let metaByCnes: Record<
      string,
      { estabelecimento: string; municipio: string; uf: string; ibge: string }
    > = {};

    if (cnesList.length > 0) {
      const result = await pool.query(
        `
        SELECT
          e.cnes,
          e.nome AS estabelecimento,
          m.nome AS municipio,
          m.ibge,
          es.uf
        FROM recursos.estabelecimentos e
        JOIN recursos.municipios m ON m.id = e.municipio_id
        JOIN recursos.estados es   ON es.id = m.estado_id
        WHERE e.cnes = ANY($1::text[])
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
