const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ${name} nao definida`);
  return v;
}

function toDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

async function main() {
  const uploadDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    throw new Error(`Pasta uploads nao existe: ${uploadDir}`);
  }

  const files = fs.readdirSync(uploadDir);
  const uploadedCnes = new Set();
  for (const filename of files) {
    if (!filename.toLowerCase().endsWith(".pdf")) continue;
    const match = filename.match(/__CNES-(.+?)__/);
    if (!match) continue;
    const cnesRaw = match[1];
    const cnes = toDigits(cnesRaw);
    if (cnes) uploadedCnes.add(cnes);
  }

  const pool = new Pool({
    host: must("DB_HOST"),
    port: Number(must("DB_PORT")),
    user: must("DB_USER"),
    password: must("DB_PASSWORD"),
    database: must("DB_NAME"),
    // ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const res = await pool.query(`
    SELECT DISTINCT e.cnes::text AS cnes
    FROM recursos.acoes_vagas av
    JOIN recursos.estabelecimentos e ON e.id = av.estabelecimento_id
  `);

  const solicitantes = new Set();
  for (const row of res.rows) {
    const cnes = toDigits(row.cnes);
    if (cnes) solicitantes.add(cnes);
  }

  await pool.end();

  const semPdf = Array.from(solicitantes).filter((cnes) => !uploadedCnes.has(cnes));
  semPdf.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  const outPath = path.join(process.cwd(), "cnes_sem_pdf.txt");
  fs.writeFileSync(outPath, semPdf.join("\n"), "utf8");

  console.log(`Gerado: ${outPath} (${semPdf.length} CNES)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
