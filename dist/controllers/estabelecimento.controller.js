"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEstabelecimentos = listarEstabelecimentos;
exports.listarCursosPorEstabelecimento = listarCursosPorEstabelecimento;
exports.listarTodosCursos = listarTodosCursos;
const pool_1 = require("../db/pool");
// normaliza o que vem do front (municipal/estadual ou MUNICIPAL/ESTADUAL)
function normNivel(v) {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "MUNICIPAL")
        return "MUNICIPAL";
    if (s === "ESTADUAL")
        return "ESTADUAL";
    return "";
}
async function listarEstabelecimentos(req, res) {
    try {
        const { municipio_id, status_adesao, nivel_gestao } = req.query;
        if (!municipio_id) {
            return res.status(400).json({ ok: false, error: "municipio_id é obrigatório" });
        }
        const municipioIdNum = Number(municipio_id);
        if (!Number.isFinite(municipioIdNum)) {
            return res.status(400).json({ ok: false, error: "municipio_id inválido" });
        }
        const status = String(status_adesao || "").trim().toUpperCase();
        const filtrarPorStatus = status === "ADERIDO" || status === "NAO_ADERIDO";
        const ng = normNivel(nivel_gestao);
        const filtrarPorNg = ng === "MUNICIPAL" || ng === "ESTADUAL";
        const params = [municipioIdNum];
        const filtros = [];
        if (filtrarPorStatus) {
            params.push(status);
            filtros.push(`status_adesao = $${params.length}`);
        }
        /**
         * ✅ REGRA ROBUSTA:
         * - Considera trim/upper
         * - "DOBRO"/"AMBOS"/"MISTO"/"DUPLO" aparece nos dois
         * - se o campo tiver "ESTADUAL/MUNICIPAL" (ou qualquer string que contenha ESTADUAL/MUNICIPAL), entra também
         */
        if (filtrarPorNg) {
            params.push(ng);
            const idx = params.length;
            // campo normalizado do banco
            const NG_COL = `UPPER(TRIM(COALESCE(nivel_gestao, '')))`;
            filtros.push(`
        (
          ${NG_COL} = $${idx}
          OR ${NG_COL} IN ('DOBRO','AMBOS','MISTO','DUPLO','DUPLA')
          OR ${NG_COL} LIKE '%' || $${idx} || '%'
        )
      `);
        }
        const whereExtra = filtros.length ? ` AND ${filtros.join(" AND ")}` : "";
        const result = await pool_1.pool.query(`
      SELECT id, nome, cnes, nivel_gestao
      FROM recursos.estabelecimentos
      WHERE municipio_id = $1
      ${whereExtra}
      ORDER BY nome
      `, params);
        return res.json(result.rows);
    }
    catch (error) {
        console.error("Erro ao listar estabelecimentos:", error);
        return res.status(500).json({ ok: false, error: "Erro ao listar estabelecimentos" });
    }
}
async function listarCursosPorEstabelecimento(req, res) {
    try {
        const { estabelecimento_id } = req.query;
        if (!estabelecimento_id) {
            return res.status(400).json({ ok: false, error: "estabelecimento_id é obrigatório" });
        }
        const estabelecimentoIdNum = Number(estabelecimento_id);
        if (!Number.isFinite(estabelecimentoIdNum)) {
            return res.status(400).json({ ok: false, error: "estabelecimento_id inválido" });
        }
        const result = await pool_1.pool.query(`
      SELECT
        c.id,
        c.nome,
        c.vagas AS teto,

        GREATEST(
          COALESCE(SUM(CASE WHEN av.tipo_acao = 'AUMENTAR_VAGAS' THEN av.quantidade ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN av.tipo_acao = 'DIMINUIR_VAGAS' THEN av.quantidade ELSE 0 END), 0),
          0
        ) AS "vagasSolicitadas",

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
      `, [estabelecimentoIdNum]);
        return res.json(result.rows);
    }
    catch (error) {
        console.error("Erro ao listar cursos por estabelecimento:", error);
        return res.status(500).json({ ok: false, error: "Erro ao listar cursos por estabelecimento" });
    }
}
async function listarTodosCursos(req, res) {
    const client = await pool_1.pool.connect();
    try {
        const result = await client.query(`
      SELECT DISTINCT nome
      FROM recursos.cursos
      ORDER BY nome
    `);
        return res.json(result.rows);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, error: "Erro ao listar cursos" });
    }
    finally {
        client.release();
    }
}
