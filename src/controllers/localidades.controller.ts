import { Request, Response } from "express";
import { pool } from "../db/pool";

// 🔹 Lista estados
export async function listarEstados(req: Request, res: Response) {
  const result = await pool.query(`
    SELECT uf, nome
    FROM recursos.estados
    ORDER BY nome
  `);

  res.json(result.rows);
}

// 🔹 Lista municípios por UF
export async function listarMunicipiosPorUF(req: Request, res: Response) {
  const { uf } = req.query;

  if (!uf) {
    return res.status(400).json({ error: "UF é obrigatória" });
  }

  const result = await pool.query(
    `
    SELECT
      m.id AS municipio_id,
      m.nome,
      m.ibge
    FROM recursos.municipios m
    JOIN recursos.estados e ON e.id = m.estado_id
    WHERE e.uf = $1
    ORDER BY m.nome
    `,
    [uf]
  );

  res.json(result.rows);
}