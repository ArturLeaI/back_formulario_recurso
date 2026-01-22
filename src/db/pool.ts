// src/db/pool.ts
import { Pool } from "pg";
import "dotenv/config";

function must(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`ENV ${name} não definida`);
  }
  return v;
}

export const pool = new Pool({
  host: must("DB_HOST"),
  port: Number(must("DB_PORT")),
  user: must("DB_USER"),
  password: must("DB_PASSWORD"),
  database: must("DB_NAME"),
  // ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
