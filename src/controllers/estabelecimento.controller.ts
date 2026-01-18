import { Request, Response } from "express";
import { pool } from "../db/pool";

export async function listarEstabelecimentos(req: Request, res: Response) {
  const { municipio_id } = req.query;

  if (!municipio_id) {
    return res.status(400).json({ error: "municipio_id é obrigatório" });
  }

  const result = await pool.query(
    `SELECT id, nome, cnes
     FROM recursos.estabelecimentos
     WHERE municipio_id = $1
     ORDER BY nome`,
    [municipio_id]
  );

  res.json(result);
}

export async function listarCursosPorEstabelecimento(
  req: Request,
  res: Response
) {
  const { estabelecimento_id } = req.query;

  if (!estabelecimento_id) {
    return res.status(400).json({ error: "estabelecimento_id é obrigatório" });
  }

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.nome,
      c.vagas,
      COALESCE(SUM(avc.quantidade), 0) AS vagas_usadas,
      (c.vagas - COALESCE(SUM(avc.quantidade), 0)) AS vagas_disponiveis
    FROM recursos.cursos c
    LEFT JOIN recursos.acoes_vagas_cursos avc ON avc.curso_id = c.id
    WHERE c.estabelecimento_id = $1
    GROUP BY c.id
    ORDER BY c.nome
    `,
    [estabelecimento_id]
  );

  res.json(result);
}