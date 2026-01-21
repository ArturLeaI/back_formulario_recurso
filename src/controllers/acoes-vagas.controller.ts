// src/controllers/acoes-vagas.controller.ts
import { Request, Response } from "express";
import { pool } from "../db/pool";

function normalizeUpper(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function mapTipoAcao(tipoAcaoRaw: unknown) {
  const v = normalizeUpper(tipoAcaoRaw);

  if (v === "AUMENTAR VAGAS" || v === "AUMENTAR_VAGAS") return "AUMENTAR_VAGAS";
  if (v === "DIMINUIR VAGAS" || v === "DIMINUIR_VAGAS") return "DIMINUIR_VAGAS";
  if (v === "MUDANCA_CURSO" || v === "MUDANÇA DE CURSO" || v === "MUDANCA CURSO")
    return "MUDANCA_CURSO";
  if (v === "INCLUIR_APRIMORAMENTO" || v === "INCLUIR APRIMORAMENTO")
    return "INCLUIR_APRIMORAMENTO";
  if (v === "ADESAO_EDITAL" || v === "ADESAO EDITAL" || v === "ADESÃO POR PERDA DE PRAZO")
    return "ADESAO_EDITAL";
  if (v === "DESCREDENCIAR VAGA" || v === "DESCREDENCIAR_VAGA" || v === "DESISTIR DA ADESAO")
    return "DESCREDENCIAR_VAGA";

  return v;
}

type CursoBody = {
  id: any;
  nome?: string;
  quantidade: any;
  cnes?: string;
  estabelecimento?: string;
};

function isFinitePositive(n: number) {
  return Number.isFinite(n) && n > 0;
}

export async function listarCursosPorEstabelecimento(req: Request, res: Response) {
  const estabelecimentoId = Number(req.query.estabelecimento_id);

  if (!Number.isFinite(estabelecimentoId)) {
    return res.status(400).json({ ok: false, error: "estabelecimento_id inválido" });
  }

  try {
    const r = await pool.query(
      `
      SELECT
        c.id,
        c.nome,
        c.vagas,
        GREATEST(
          COALESCE(SUM(CASE WHEN av.tipo_acao = 'AUMENTAR_VAGAS' THEN av.quantidade ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN av.tipo_acao = 'DIMINUIR_VAGAS' THEN av.quantidade ELSE 0 END), 0),
          0
        ) AS "vagasSolicitadas"
      FROM recursos.cursos c
      LEFT JOIN recursos.acoes_vagas av
        ON av.curso_id = c.id
      AND av.estabelecimento_id = $1
      WHERE c.estabelecimento_id = $1
      GROUP BY c.id, c.nome, c.vagas
      ORDER BY c.nome
  `,
      [estabelecimentoId]
    );

    return res.json(r.rows);
  } catch (e: any) {
    console.error("Erro ao listar cursos por estabelecimento:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro interno" });
  }
}

async function getSaldoSolicitadoCurso(
  client: any,
  cursoId: number,
  estabelecimentoId: number
): Promise<number> {
  const r = await client.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN tipo_acao IN ('AUMENTAR_VAGAS','AUMENTAR VAGAS') THEN quantidade ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN tipo_acao IN ('DIMINUIR_VAGAS','DIMINUIR VAGAS') THEN quantidade ELSE 0 END), 0)
      AS saldo
    FROM recursos.acoes_vagas
    WHERE curso_id = $1
      AND estabelecimento_id = $2;
    `,
    [cursoId, estabelecimentoId]
  );
  return Number(r.rows[0]?.saldo ?? 0);
}

export async function criarAcaoVagasFormularioSemAuth(req: Request, res: Response) {
  const client = await pool.connect();

  const rollbackAndReturn = async (status: number, payload: any) => {
    try {
      await client.query("ROLLBACK");
    } catch { }
    return res.status(status).json(payload);
  };

  try {
    const {
      tipoAcao: tipoAcaoRaw,
      motivoDescredenciar,
      ufSelecionada,
      municipioSelecionado,
      municipio_id,
      cursos,
      gestorId,

      // ✅ para desistir
      cnes, // CNES do estabelecimento a descredenciar
    } = req.body;

    if (!tipoAcaoRaw) return res.status(400).json({ ok: false, error: "Tipo de ação é obrigatório" });
    if (!gestorId) return res.status(400).json({ ok: false, error: "gestorId é obrigatório" });

    const tipoAcao = mapTipoAcao(tipoAcaoRaw);

    // =========================
    // Validação básica UF
    // =========================
    const ufNorm = normalizeUpper(ufSelecionada);
    if (!ufNorm) return res.status(400).json({ ok: false, error: "UF é obrigatória" });

    const cursosArr: CursoBody[] = Array.isArray(cursos) ? cursos : [];

    // DESCREDENCIAR: não exige cursos
    if (tipoAcao === "DESCREDENCIAR_VAGA") {
      if (!motivoDescredenciar) {
        return res.status(400).json({ ok: false, error: "Motivo é obrigatório para desistir da adesão" });
      }
      if (!cnes || !String(cnes).trim()) {
        return res.status(400).json({ ok: false, error: "CNES do estabelecimento é obrigatório para desistir da adesão" });
      }
    } else {
      // outras ações exigem cursos
      if (cursosArr.length === 0) {
        return res.status(400).json({ ok: false, error: "Informe ao menos um curso" });
      }
    }

    await client.query("BEGIN");

    // =========================
    // Valida gestor existe
    // =========================
    const gestorCheck = await client.query(
      `SELECT id, cpf, nome, email FROM recursos.gestores WHERE id = $1`,
      [Number(gestorId)]
    );
    if (gestorCheck.rows.length === 0) {
      return rollbackAndReturn(400, { ok: false, error: "gestorId não encontrado" });
    }

    // =========================
    // Resolve municipio_id
    // =========================
    let municipioId: number | null = null;

    if (municipio_id != null && String(municipio_id).trim() !== "") {
      const mid = Number(municipio_id);
      if (!Number.isFinite(mid)) return rollbackAndReturn(400, { ok: false, error: "municipio_id inválido" });

      const r = await client.query(`SELECT id, estado_id FROM recursos.municipios WHERE id = $1`, [mid]);
      if (r.rows.length === 0) return rollbackAndReturn(400, { ok: false, error: "Município (municipio_id) não encontrado" });

      municipioId = r.rows[0].id;
    } else if (municipioSelecionado) {
      const municipioNome = String(municipioSelecionado).trim();
      const r = await client.query(
        `
        SELECT id, estado_id
        FROM recursos.municipios
        WHERE UPPER(nome) = UPPER($1)
        LIMIT 1
        `,
        [municipioNome]
      );
      if (r.rows.length === 0) return rollbackAndReturn(400, { ok: false, error: "Município não encontrado" });

      municipioId = r.rows[0].id;
    }

    if (!municipioId) {
      return rollbackAndReturn(400, { ok: false, error: "Município é obrigatório" });
    }

    // =========================
    // Valida UF x município
    // =========================
    const ufCheck = await client.query(
      `
      SELECT e.uf
      FROM recursos.municipios m
      JOIN recursos.estados e ON e.id = m.estado_id
      WHERE m.id = $1
      `,
      [municipioId]
    );

    const ufDoMunicipio = normalizeUpper(ufCheck.rows[0]?.uf ?? "");
    if (ufDoMunicipio && ufDoMunicipio !== ufNorm) {
      return rollbackAndReturn(400, {
        ok: false,
        error: `UF selecionada (${ufNorm}) não bate com UF do município (${ufDoMunicipio})`,
      });
    }

    // =========================
    // Helper: resolve estabelecimento por CNES
    // =========================
    const getEstByCnes = async (cnesValue: string) => {
      const r = await client.query(
        `
        SELECT id, cnes, municipio_id, nome
        FROM recursos.estabelecimentos
        WHERE cnes = $1
        LIMIT 1
        `,
        [cnesValue]
      );
      return r.rows[0] ?? null;
    };

    // =========================
    // DESCREDENCIAR_VAGA
    // =========================
    if (tipoAcao === "DESCREDENCIAR_VAGA") {
      const cnesValue = String(cnes).trim();
      const est = await getEstByCnes(cnesValue);
      if (!est) return rollbackAndReturn(400, { ok: false, error: `Estabelecimento CNES "${cnesValue}" não encontrado` });

      if (Number(est.municipio_id) !== Number(municipioId)) {
        return rollbackAndReturn(400, { ok: false, error: "Estabelecimento não pertence ao município selecionado" });
      }

      const acaoResult = await client.query(
        `
        INSERT INTO recursos.acoes_vagas
          (gestor_id, tipo_acao, uf, municipio_id, estabelecimento_id, motivo_descredenciamento, data_criacao)
        VALUES
          ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
        `,
        [Number(gestorId), tipoAcao, ufNorm, municipioId, Number(est.id), String(motivoDescredenciar)]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        ok: true,
        acao_id: acaoResult.rows[0].id,
        gestor: gestorCheck.rows[0],
        message: "Desistência registrada com sucesso",
      });
    }

    // =========================
    // ✅ Demais ações: NÃO cria "header"
    // =========================
    const acaoIdsCriados: number[] = [];

    // =========================
    // Processa cursos
    // =========================
    for (const curso of cursosArr) {
      const quantidade = Number(curso.quantidade);
      if (!isFinitePositive(quantidade)) {
        return rollbackAndReturn(400, {
          ok: false,
          error: `Quantidade inválida para o curso "${curso.nome ?? curso.id}"`,
        });
      }

      const cnesItem = String(curso.cnes ?? "").trim();
      if (!cnesItem) {
        return rollbackAndReturn(400, { ok: false, error: "CNES é obrigatório em cada curso enviado" });
      }

      const est = await getEstByCnes(cnesItem);
      if (!est) return rollbackAndReturn(400, { ok: false, error: `Estabelecimento CNES "${cnesItem}" não encontrado` });

      if (Number(est.municipio_id) !== Number(municipioId)) {
        return rollbackAndReturn(400, {
          ok: false,
          error: `Estabelecimento (CNES ${cnesItem}) não pertence ao município selecionado`,
        });
      }

      const estabelecimentoId = Number(est.id);

      // resolve cursoId
      let cursoId: number | null = null;

      // (A) por id numérico
      const idNum = Number(curso.id);
      if (Number.isFinite(idNum) && String(curso.id).trim() !== "") {
        const r = await client.query(
          `SELECT id, estabelecimento_id FROM recursos.cursos WHERE id = $1`,
          [idNum]
        );

        if (r.rows.length > 0) {
          if (Number(r.rows[0].estabelecimento_id) !== estabelecimentoId) {
            return rollbackAndReturn(400, { ok: false, error: "Curso não pertence ao estabelecimento selecionado" });
          }
          cursoId = Number(r.rows[0].id);
        }
      }

      // (B) por nome dentro do estabelecimento
      if (!cursoId) {
        const nomeCurso = String(curso.nome ?? curso.id ?? "").trim();
        if (!nomeCurso) return rollbackAndReturn(400, { ok: false, error: "Curso sem id/nome válido" });

        const r = await client.query(
          `
          SELECT id
          FROM recursos.cursos
          WHERE estabelecimento_id = $1
            AND UPPER(nome) = UPPER($2)
          LIMIT 1
          `,
          [estabelecimentoId, nomeCurso]
        );

        if (r.rows.length > 0) {
          cursoId = Number(r.rows[0].id);
        } else {
          // só cria no INCLUIR_APRIMORAMENTO
          if (tipoAcao !== "INCLUIR_APRIMORAMENTO") {
            return rollbackAndReturn(400, { ok: false, error: `Curso "${nomeCurso}" não existe no estabelecimento` });
          }

          const created = await client.query(
            `
            INSERT INTO recursos.cursos (nome, vagas, estabelecimento_id)
            VALUES ($1, 0, $2)
            RETURNING id
            `,
            [nomeCurso, estabelecimentoId]
          );

          cursoId = Number(created.rows[0].id);
        }
      }

      // ✅ valida DIMINUIR_VAGAS: só pode diminuir o que foi solicitado (saldo)
      if (tipoAcao === "DIMINUIR_VAGAS") {
        const saldo = await getSaldoSolicitadoCurso(client, cursoId, estabelecimentoId);
        if (saldo <= 0) {
          return rollbackAndReturn(400, { ok: false, error: "Não há vagas solicitadas para diminuir" });
        }
        if (quantidade > saldo) {
          return rollbackAndReturn(400, { ok: false, error: `Você só pode diminuir até ${saldo}` });
        }
      }

      // ✅ insere linha real em acoes_vagas (agora retornando id)
      const createdAcao = await client.query(
        `
        INSERT INTO recursos.acoes_vagas
          (gestor_id, tipo_acao, uf, municipio_id, estabelecimento_id, curso_id, quantidade, data_criacao)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
        `,
        [Number(gestorId), tipoAcao, ufNorm, municipioId, estabelecimentoId, cursoId, quantidade]
      );

      acaoIdsCriados.push(Number(createdAcao.rows[0].id));

      // atualiza vagas
      const deveSomar =
        tipoAcao === "AUMENTAR_VAGAS" ||
        tipoAcao === "INCLUIR_APRIMORAMENTO" ||
        tipoAcao === "ADESAO_EDITAL";

      if (deveSomar) {
        await client.query(`UPDATE recursos.cursos SET vagas = vagas + $1 WHERE id = $2`, [quantidade, cursoId]);
      }

      if (tipoAcao === "DIMINUIR_VAGAS") {
        // aqui sua regra é "diminuir apenas as vagas solicitadas", mas você também atualiza vagas do curso.
        // mantive como você tinha (atualizar vagas), porque o sistema parece tratar "vagas" como total.
        await client.query(`UPDATE recursos.cursos SET vagas = GREATEST(vagas - $1, 0) WHERE id = $2`, [quantidade, cursoId]);
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      acao_ids: acaoIdsCriados,
      gestor: gestorCheck.rows[0],
      message: "Ação de vagas criada com sucesso",
    });
  } catch (error: any) {
    try {
      await client.query("ROLLBACK");
    } catch { }

    console.error("Erro ao criar ação de vagas:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro interno ao processar a ação",
    });
  } finally {
    client.release();
  }
}
