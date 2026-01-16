import { Request, Response } from "express";
import { pool } from "../db/pool";

export async function criarAcaoVagas(req: Request, res: Response) {
  const client = await pool.connect();

  try {
    const { tipo_acao, municipio_ibge, itens } = req.body;

    if (!tipo_acao || !municipio_ibge || !Array.isArray(itens)) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      INSERT INTO acoes_vagas (tipo_acao, municipio_ibge)
      VALUES ($1, $2)
      RETURNING id
      `,
      [tipo_acao, municipio_ibge]
    );

    const acaoId = rows[0].id;

    for (const item of itens) {
      await client.query(
        `
        INSERT INTO acoes_vagas_cursos
        (acao_id, curso_id, quantidade)
        VALUES ($1, $2, $3)
        `,
        [acaoId, item.curso_id, item.quantidade]
      );
      // 🔥 trigger validar_vagas_por_curso é executada aqui
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      acao_id: acaoId,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    res.status(400).json({
      ok: false,
      error: error.message,
    });
  } finally {
    client.release();
  }
}