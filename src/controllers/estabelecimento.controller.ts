import { Request, Response } from "express";
import { pool } from "../db/pool";

export async function listarEstabelecimentos(req: Request, res: Response) {
  try {
    const { municipio_id, status_adesao } = req.query;

    if (!municipio_id) {
      return res.status(400).json({ error: "municipio_id é obrigatório" });
    }

    const municipioIdNum = Number(municipio_id);
    if (Number.isNaN(municipioIdNum)) {
      return res.status(400).json({ error: "municipio_id inválido" });
    }

    const status = String(status_adesao || "").trim().toUpperCase();
    const filtrarPorStatus = status === "ADERIDO" || status === "NAO_ADERIDO";

    const params: any[] = [municipioIdNum];
    let filtroStatusSql = "";

    if (filtrarPorStatus) {
      params.push(status);
      filtroStatusSql = ` AND status_adesao = $2 `;
    }

    const result = await pool.query(
      `
      SELECT id, nome, cnes
      FROM recursos.estabelecimentos
      WHERE municipio_id = $1
      ${filtroStatusSql}
      ORDER BY nome
      `,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar estabelecimentos:", error);
    return res.status(500).json({ error: "Erro ao listar estabelecimentos" });
  }
}

export async function listarCursosPorEstabelecimento(req: Request, res: Response) {
  try {
    const { estabelecimento_id } = req.query;

    if (!estabelecimento_id) {
      return res.status(400).json({ error: "estabelecimento_id é obrigatório" });
    }

    const estabelecimentoIdNum = Number(estabelecimento_id);
    if (!Number.isFinite(estabelecimentoIdNum)) {
      return res.status(400).json({ error: "estabelecimento_id inválido" });
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.nome,
        c.vagas AS teto,

        -- saldo que existe para DIMINUIR (nunca negativo)
        GREATEST(
          COALESCE(SUM(CASE WHEN av.tipo_acao = 'AUMENTAR_VAGAS' THEN av.quantidade ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN av.tipo_acao = 'DIMINUIR_VAGAS' THEN av.quantidade ELSE 0 END), 0),
          0
        ) AS "vagasSolicitadas",

        -- quanto ainda pode AUMENTAR até bater o teto (nunca negativo)
        GREATEST(
          c.vagas
          - (
            COALESCE(SUM(CASE WHEN av.tipo_acao = 'AUMENTAR_VAGAS' THEN av.quantidade ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN av.tipo_acao = 'DIMINUIR_VAGAS' THEN av.quantidade ELSE 0 END), 0)
          ),
          0
        ) AS "vagasDisponiveisAumentar"

      FROM recursos.cursos c
      LEFT JOIN recursos.acoes_vagas av
        ON av.curso_id = c.id
      AND av.estabelecimento_id = c.estabelecimento_id
      WHERE c.estabelecimento_id = $1
      GROUP BY c.id, c.nome, c.vagas
      ORDER BY c.nome;
      `,
      [estabelecimentoIdNum]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Erro ao listar cursos por estabelecimento:", error);
    return res.status(500).json({ error: "Erro ao listar cursos por estabelecimento" });
  }
}

export async function listarTodosCursos(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT nome
      FROM recursos.cursos
      ORDER BY nome
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao listar cursos" });
  } finally {
    client.release();
  }
}
