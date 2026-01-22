import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const router = Router();

// 🔹 DIRETÓRIO LOCAL (dev)

const isProd = process.env.RAILWAY_ENVIRONMENT === "production";
const LOCAL_TEST_DIR = path.join(__dirname, "../uploads");
// 🔹 PRODUÇÃO

const PROD_DIR = path.join(process.cwd(), "uploads");

// 🔹 Escolha automática
const UPLOAD_DIR = isProd
    ? "/uploads"
    : path.join(process.cwd(), "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function isValidCNES(value: unknown) {
    return typeof value === "string" && /^\d{7}$/.test(value);
}

// remove caracteres ruins e limita tamanho (evita problemas no Windows/Linux)
function sanitizeBaseName(name: string) {
    const base = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .replace(/\.[^/.]+$/, "") // remove extensão
        .replace(/[^\w\s()-]/g, "") // remove caracteres perigosos
        .replace(/\s+/g, "_")
        .trim();

    // evita nome vazio e limita tamanho
    return (base || "arquivo").slice(0, 80);
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

    // ✅ salva temporário; renomeamos depois usando CNES + originalname
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || ".pdf").toLowerCase();
        cb(null, `tmp-${Date.now()}-${randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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
            // se CNES inválido, remove o arquivo temporário
            if (req.file?.filename) {
                const tmpPath = path.join(UPLOAD_DIR, req.file.filename);
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            }
            return res
                .status(400)
                .json({ ok: false, message: "CNES inválido (7 dígitos)" });
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
            url: `/uploads/${encodeURIComponent(finalName)}`, // ✅ já devolve url pronta
        });
    } catch (err: any) {
        return res
            .status(500)
            .json({ ok: false, message: err?.message || "Erro no upload" });
    }
});

// ✅ GET /uploads/:filename — visualizar/baixar PDF (INLINE)
router.get("/:filename", (req, res) => {
    try {
        const filename = String(req.params.filename || "");

        // ✅ evita path traversal e só permite pdf
        if (
            filename.includes("..") ||
            filename.includes("/") ||
            filename.includes("\\")
        ) {
            return res.status(400).json({ ok: false, message: "Nome de arquivo inválido" });
        }

        // decode caso venha com %20 etc.
        const decoded = decodeURIComponent(filename);

        if (!decoded.toLowerCase().endsWith(".pdf")) {
            return res.status(400).json({ ok: false, message: "Apenas PDF" });
        }

        const filePath = path.join(UPLOAD_DIR, decoded);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ ok: false, message: "Arquivo não encontrado" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${decoded}"`);

        return res.sendFile(filePath);
    } catch (err: any) {
        return res
            .status(500)
            .json({ ok: false, message: err?.message || "Erro ao abrir PDF" });
    }
});

// GET /uploads — listar PDFs
router.get("/", (req, res) => {
    try {
        const files = fs.readdirSync(UPLOAD_DIR);

        const pdfs = files
            .filter((f) => f.toLowerCase().endsWith(".pdf"))
            .map((filename) => {
                const fullPath = path.join(UPLOAD_DIR, filename);
                const st = fs.statSync(fullPath);

                // tenta extrair CNES do padrão __CNES-1234567__
                const match = filename.match(/__CNES-(\d{7})__/);
                const cnes = match?.[1] ?? null;

                return {
                    filename,
                    cnes,
                    sizeKB: Number((st.size / 1024).toFixed(2)),
                    createdAt: st.birthtime,
                    url: `/uploads/${encodeURIComponent(filename)}`, // ✅ agora funciona (tem endpoint)
                };
            });

        return res.json({ ok: true, total: pdfs.length, files: pdfs });
    } catch {
        return res.status(500).json({ ok: false, message: "Erro ao listar arquivos" });
    }
});

export default router;
