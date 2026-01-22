import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const router = Router();

// 🔹 DIRETÓRIO LOCAL APENAS PARA TESTE
// Só será usado quando NODE_ENV !== "production"
const LOCAL_TEST_DIR = path.join(__dirname, "../uploads");

// 🔹 Produção (Railway ou servidor)
const PROD_DIR = path.join(process.cwd(), "uploads");

// 🔹 Decide automaticamente
const UPLOAD_DIR =
  process.env.NODE_ENV === "production" ? PROD_DIR : LOCAL_TEST_DIR;

// garante que a pasta existe
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
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

// POST /uploads
router.post("/", upload.single("file"), (req, res) => {
  return res.status(201).json({
    ok: true,
    filename: req.file?.filename,
    savedAt: UPLOAD_DIR, // 👈 ajuda a confirmar
  });
});

export default router;
