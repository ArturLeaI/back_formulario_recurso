import express  from 'express';
import app from "./app";
import fs from "fs";
import path from "path";

app.listen(8080, () => {
  console.log("Backend rodando em http://localhost:8080");
});



const LOCAL_TEST_DIR = path.join(__dirname, "../uploads");
const PROD_DIR = path.join(process.cwd(), "uploads");
const UPLOAD_DIR = process.env.NODE_ENV === "production" ? PROD_DIR : LOCAL_TEST_DIR;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ expõe /uploads/<arquivo>.pdf
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders(res, filePath) {
      if (filePath.toLowerCase().endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
    },
  })
);