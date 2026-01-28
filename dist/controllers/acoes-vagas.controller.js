"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarCursosPorEstabelecimento = listarCursosPorEstabelecimento;
exports.criarAcaoVagasFormularioSemAuth = criarAcaoVagasFormularioSemAuth;
const pool_1 = require("../db/pool");
/**
 * ✅ Controller completo com Mudança de Curso funcionando (novo + compat antigo)
 * - Aceita:
 *   (A) novo formato: cursosRemover[] e cursosAdicionar[]
 *   (B) compat: cursos[] com operacao: "REMOVER" | "ADICIONAR"
 * - Valida:
 *   - CNES único (mesmo estabelecimento) em toda mudança
 *   - totalRemover === totalAdicionar
 *   - diminuir não pode exceder saldo solicitado
 *   - aumentar não pode exceder teto (saldo disponível do teto)
 *
 * ✅ Regras ajustadas:
 * - CNES pode ter qualquer tamanho (desde que tenha ao menos 1 dígito após sanitização)
 * - DESCREDENCIAR_VAGA (desistir) NÃO exige quantidade e registra quantidade=0
 * - DESCREDENCIAR_VAGA NÃO usa cursos[] (usa cnes + curso_id)
 * - Remove curso_nome do INSERT (coluna não existe na tabela acoes_vagas)
 */
// ======================
// Utils básicas
// ======================
function normalizeUpper(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}
/**
 * ✅ CNES SEM NORMALIZAÇÃO (NÃO coloca 0 à esquerda)
 * - remove máscara / caracteres não numéricos
 * - aceita QUALQUER quantidade de dígitos (>= 1)
 * - caso contrário: ""
 */
function sanitizeCnes(value) {
    const raw = String(value ?? "")
        .trim()
        .replace(/\D/g, "");
    return raw.length >= 1 ? raw : "";
}
function isValidCnes(value) {
    return sanitizeCnes(value).length >= 1;
}
function mapTipoAcao(tipoAcaoRaw) {
    const v = normalizeUpper(tipoAcaoRaw);
    if (v === "AUMENTAR VAGAS" || v === "AUMENTAR_VAGAS")
        return "AUMENTAR_VAGAS";
    if (v === "DIMINUIR VAGAS" || v === "DIMINUIR_VAGAS")
        return "DIMINUIR_VAGAS";
    if (v === "MUDANCA_CURSO" || v === "MUDANÇA DE CURSO" || v === "MUDANCA CURSO")
        return "MUDANCA_CURSO";
    if (v === "INCLUIR_APRIMORAMENTO" || v === "INCLUIR APRIMORAMENTO")
        return "INCLUIR_APRIMORAMENTO";
    if (v === "ADESAO_EDITAL" || v === "ADESAO EDITAL" || v === "ADESÃO POR PERDA DE PRAZO")
        return "ADESAO_EDITAL";
    // ✅ desistência / descredenciar (com e sem acento)
    if (v === "DESCREDENCIAR VAGA" ||
        v === "DESCREDENCIAR_VAGA" ||
        v === "DESISTIR DA ADESAO" ||
        v === "DESISTIR DA ADESÃO" ||
        v === "DESISTENCIA DA ADESAO" ||
        v === "DESISTÊNCIA DA ADESÃO" ||
        v === "DESISTENCIA" ||
        v === "DESISTÊNCIA" ||
        v === "DESISTIR") {
        return "DESCREDENCIAR_VAGA";
    }
    return v;
}
function isFinitePositive(n) {
    return Number.isFinite(n) && n > 0;
}
function toInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}
// ======================
// Queries auxiliares
// ======================
/**
 * Saldo "solicitado" do curso baseado nas ações:
 * AUMENTAR_VAGAS - DIMINUIR_VAGAS (mesmo estabelecimento + curso).
 * Compatível com registros antigos com espaço.
 */
async function getSaldoSolicitadoCurso(client, cursoId, estabelecimentoId) {
    const r = await client.query(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo_acao IN ('AUMENTAR_VAGAS','AUMENTAR VAGAS') THEN quantidade ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN tipo_acao IN ('DIMINUIR_VAGAS','DIMINUIR VAGAS') THEN quantidade ELSE 0 END), 0)
      AS saldo
    FROM recursos.acoes_vagas
    WHERE curso_id = $1
      AND estabelecimento_id = $2;
    `, [cursoId, estabelecimentoId]);
    return Math.max(Number(r.rows[0]?.saldo ?? 0), 0);
}
async function getTetoCurso(client, cursoId) {
    const r = await client.query(`SELECT vagas FROM recursos.cursos WHERE id = $1`, [cursoId]);
    return Number(r.rows[0]?.vagas ?? 0);
}
/**
 * Valida ações que consomem o teto:
 * - AUMENTAR_VAGAS
 * - ADESAO_EDITAL
 * (INCLUIR_APRIMORAMENTO é LIVRE)
 */
async function validarConsumoDeTeto(params) {
    const { client, tipoAcao, cursoId, estabelecimentoId, quantidade } = params;
    // ✅ REGRA: incluir_aprimoramento é LIVRE (não valida teto/saldo)
    if (tipoAcao === "INCLUIR_APRIMORAMENTO")
        return;
    const consomeTeto = tipoAcao === "AUMENTAR_VAGAS" || tipoAcao === "ADESAO_EDITAL";
    if (!consomeTeto)
        return;
    const saldoAntes = await getSaldoSolicitadoCurso(client, cursoId, estabelecimentoId);
    const teto = await getTetoCurso(client, cursoId);
    const disponivel = Math.max(teto - saldoAntes, 0);
    if (disponivel <= 0)
        throw new Error("Não há saldo disponível para aumentar");
    if (quantidade > disponivel)
        throw new Error(`Você só pode aumentar até ${disponivel}`);
}
/** ✅ Resolve estabelecimento por CNES (SEM completar com 0) */
async function getEstByCnes(client, cnesValue) {
    const cnesTrim = String(cnesValue ?? "").trim();
    const r = await client.query(`
    SELECT id, cnes, municipio_id, nome
    FROM recursos.estabelecimentos
    WHERE TRIM(cnes::text) = TRIM($1::text)
    LIMIT 1
    `, [cnesTrim]);
    return r.rows[0] ?? null;
}
/** Resolve município (id) */
async function resolveMunicipioId(client, municipio_id, municipioSelecionado) {
    let municipioId = null;
    if (municipio_id != null && String(municipio_id).trim() !== "") {
        const mid = Number(municipio_id);
        if (!Number.isFinite(mid))
            throw new Error("municipio_id inválido");
        const r = await client.query(`SELECT id, estado_id FROM recursos.municipios WHERE id = $1`, [mid]);
        if (r.rows.length === 0)
            throw new Error("Município (municipio_id) não encontrado");
        municipioId = Number(r.rows[0].id);
    }
    else if (municipioSelecionado) {
        const municipioNome = String(municipioSelecionado).trim();
        const r = await client.query(`
      SELECT id, estado_id
      FROM recursos.municipios
      WHERE UPPER(nome) = UPPER($1)
      LIMIT 1
      `, [municipioNome]);
        if (r.rows.length === 0)
            throw new Error("Município não encontrado");
        municipioId = Number(r.rows[0].id);
    }
    if (!municipioId)
        throw new Error("Município é obrigatório");
    return municipioId;
}
async function validarUfDoMunicipio(client, municipioId, ufNorm) {
    const ufCheck = await client.query(`
    SELECT e.uf
    FROM recursos.municipios m
    JOIN recursos.estados e ON e.id = m.estado_id
    WHERE m.id = $1
    `, [municipioId]);
    const ufDoMunicipio = normalizeUpper(ufCheck.rows[0]?.uf ?? "");
    if (ufDoMunicipio && ufDoMunicipio !== ufNorm) {
        throw new Error(`UF selecionada (${ufNorm}) não bate com UF do município (${ufDoMunicipio})`);
    }
}
/** Resolve cursoId (por id ou por nome no estabelecimento). Pode criar no incluir_aprimoramento */
async function resolveCursoId(params) {
    const { client, tipoAcao, curso, estabelecimentoId } = params;
    let cursoId = null;
    // (A) por id numérico
    const idNum = toInt(curso.id);
    if (Number.isFinite(idNum) && String(curso.id).trim() !== "") {
        const r = await client.query(`SELECT id, estabelecimento_id FROM recursos.cursos WHERE id = $1`, [idNum]);
        if (r.rows.length > 0) {
            if (Number(r.rows[0].estabelecimento_id) !== estabelecimentoId) {
                throw new Error("Curso não pertence ao estabelecimento selecionado");
            }
            cursoId = Number(r.rows[0].id);
        }
    }
    // (B) por nome dentro do estabelecimento
    if (!cursoId) {
        const nomeCurso = String(curso.nome ?? curso.id ?? "").trim();
        if (!nomeCurso)
            throw new Error("Curso sem id/nome válido");
        const r = await client.query(`
      SELECT id
      FROM recursos.cursos
      WHERE estabelecimento_id = $1
        AND UPPER(nome) = UPPER($2)
      LIMIT 1
      `, [estabelecimentoId, nomeCurso]);
        if (r.rows.length > 0) {
            cursoId = Number(r.rows[0].id);
        }
        else {
            if (tipoAcao !== "INCLUIR_APRIMORAMENTO") {
                throw new Error(`Curso "${nomeCurso}" não existe no estabelecimento`);
            }
            const created = await client.query(`
        INSERT INTO recursos.cursos (nome, vagas, estabelecimento_id)
        VALUES ($1, 0, $2)
        RETURNING id
        `, [nomeCurso, estabelecimentoId]);
            cursoId = Number(created.rows[0].id);
        }
    }
    return cursoId;
}
// ======================
// Mudança de Curso
// ======================
async function processarMudancaCursoPorOperacao(params) {
    const { client, gestorId, ufNorm, municipioId } = params;
    // 0) Normaliza entrada
    let removerRaw = Array.isArray(params.cursosRemover) ? params.cursosRemover : [];
    let adicionarRaw = Array.isArray(params.cursosAdicionar) ? params.cursosAdicionar : [];
    // fallback antigo
    if (removerRaw.length === 0 && adicionarRaw.length === 0) {
        const cursosArr = Array.isArray(params.cursosArr) ? params.cursosArr : [];
        removerRaw = cursosArr.filter((c) => normalizeUpper(c.operacao) === "REMOVER");
        adicionarRaw = cursosArr.filter((c) => normalizeUpper(c.operacao) === "ADICIONAR");
    }
    if (removerRaw.length === 0 && adicionarRaw.length === 0) {
        throw new Error("Em Mudança de Curso, informe ao menos um curso para REMOVER e/ou ADICIONAR.");
    }
    // 1) valida CNES único
    const all = [...removerRaw, ...adicionarRaw];
    const cnesSet = new Set(all.map((c) => sanitizeCnes(c.cnes)).filter((x) => x.length >= 1));
    if (cnesSet.size !== 1) {
        throw new Error("Mudança de curso deve conter cursos de um único estabelecimento (mesmo CNES).");
    }
    const cnesUnico = [...cnesSet][0];
    const est = await getEstByCnes(client, cnesUnico);
    if (!est)
        throw new Error(`Estabelecimento CNES "${cnesUnico}" não encontrado`);
    if (Number(est.municipio_id) !== Number(municipioId)) {
        throw new Error("Estabelecimento não pertence ao município selecionado");
    }
    const estabelecimentoId = Number(est.id);
    // 2) helper: soma por cursoId
    const somaPorCurso = async (arr) => {
        const map = new Map();
        for (const item of arr) {
            const qtd = Number(item.quantidade);
            if (!Number.isFinite(qtd) || qtd <= 0) {
                throw new Error(`Quantidade inválida para o curso "${item.nome ?? item.id}"`);
            }
            const cursoId = await resolveCursoId({
                client,
                tipoAcao: "MUDANCA_CURSO",
                curso: item,
                estabelecimentoId,
            });
            map.set(cursoId, (map.get(cursoId) ?? 0) + qtd);
        }
        return map;
    };
    const removerMap = await somaPorCurso(removerRaw);
    const adicionarMap = await somaPorCurso(adicionarRaw);
    const totalRemover = [...removerMap.values()].reduce((s, v) => s + v, 0);
    const totalAdicionar = [...adicionarMap.values()].reduce((s, v) => s + v, 0);
    if (totalRemover !== totalAdicionar) {
        throw new Error(`Mudança de curso precisa manter o total de vagas: diminuir=${totalRemover} e aumentar=${totalAdicionar}.`);
    }
    // 3) prepara ops
    const ops = [];
    for (const [cursoId, qtd] of removerMap.entries())
        ops.push({ tipo: "DIMINUIR_VAGAS", cursoId, qtd });
    for (const [cursoId, qtd] of adicionarMap.entries())
        ops.push({ tipo: "AUMENTAR_VAGAS", cursoId, qtd });
    // 4) executa (diminui primeiro)
    const acaoIdsCriados = [];
    ops.sort((a, b) => (a.tipo === "DIMINUIR_VAGAS" ? -1 : 1) - (b.tipo === "DIMINUIR_VAGAS" ? -1 : 1));
    for (const op of ops) {
        if (op.qtd <= 0)
            continue;
        if (op.tipo === "DIMINUIR_VAGAS") {
            const saldo = await getSaldoSolicitadoCurso(client, op.cursoId, estabelecimentoId);
            if (saldo <= 0)
                throw new Error("Não há vagas solicitadas para diminuir");
            if (op.qtd > saldo)
                throw new Error(`Você só pode diminuir até ${saldo}`);
        }
        if (op.tipo === "AUMENTAR_VAGAS") {
            await validarConsumoDeTeto({
                client,
                tipoAcao: "AUMENTAR_VAGAS",
                cursoId: op.cursoId,
                estabelecimentoId,
                quantidade: op.qtd,
            });
        }
        const created = await client.query(`
      INSERT INTO recursos.acoes_vagas
        (gestor_id, tipo_acao, uf, municipio_id, estabelecimento_id, curso_id, quantidade, data_criacao)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
      `, [gestorId, op.tipo, ufNorm, municipioId, estabelecimentoId, op.cursoId, op.qtd]);
        acaoIdsCriados.push(Number(created.rows[0].id));
    }
    return { estabelecimentoId, acaoIdsCriados };
}
// ======================
// Endpoints
// ======================
async function listarCursosPorEstabelecimento(req, res) {
    const estabelecimentoId = Number(req.query.estabelecimento_id);
    if (!Number.isFinite(estabelecimentoId)) {
        return res.status(400).json({ ok: false, error: "estabelecimento_id inválido" });
    }
    try {
        const r = await pool_1.pool.query(`
      SELECT
        c.id,
        c.nome,
        c.vagas,
        GREATEST(
          COALESCE(SUM(CASE WHEN av.tipo_acao IN ('AUMENTAR_VAGAS','AUMENTAR VAGAS') THEN av.quantidade ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN av.tipo_acao IN ('DIMINUIR_VAGAS','DIMINUIR VAGAS') THEN av.quantidade ELSE 0 END), 0),
          0
        ) AS "vagasSolicitadas",
        GREATEST(
          c.vagas
          - GREATEST(
              COALESCE(SUM(CASE WHEN av.tipo_acao IN ('AUMENTAR_VAGAS','AUMENTAR VAGAS') THEN av.quantidade ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN av.tipo_acao IN ('DIMINUIR_VAGAS','DIMINUIR VAGAS') THEN av.quantidade ELSE 0 END), 0),
              0
            ),
          0
        ) AS vagas_disponiveis
      FROM recursos.cursos c
      LEFT JOIN recursos.acoes_vagas av
        ON av.curso_id = c.id
       AND av.estabelecimento_id = $1
      WHERE c.estabelecimento_id = $1
      GROUP BY c.id, c.nome, c.vagas
      ORDER BY c.nome;
      `, [estabelecimentoId]);
        return res.json(r.rows);
    }
    catch (e) {
        console.error("Erro ao listar cursos por estabelecimento:", e);
        return res.status(500).json({ ok: false, error: e?.message || "Erro interno" });
    }
}
async function criarAcaoVagasFormularioSemAuth(req, res) {
    const client = await pool_1.pool.connect();
    const rollbackAndReturn = async (status, payload) => {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        return res.status(status).json(payload);
    };
    try {
        const { tipoAcao: tipoAcaoRaw, motivoDescredenciar, ufSelecionada, municipioSelecionado, municipio_id, cursos, cursosRemover, cursosAdicionar, gestorId, cnes, curso_id, } = req.body;
        if (!tipoAcaoRaw)
            return res.status(400).json({ ok: false, error: "Tipo de ação é obrigatório" });
        if (!gestorId)
            return res.status(400).json({ ok: false, error: "gestorId é obrigatório" });
        const tipoAcao = mapTipoAcao(tipoAcaoRaw);
        const ufNorm = normalizeUpper(ufSelecionada);
        if (!ufNorm)
            return res.status(400).json({ ok: false, error: "UF é obrigatória" });
        const cursosArr = Array.isArray(cursos) ? cursos : [];
        // ✅ Validações de entrada por tipo
        if (tipoAcao === "DESCREDENCIAR_VAGA") {
            if (!motivoDescredenciar) {
                return res.status(400).json({ ok: false, error: "Motivo é obrigatório para desistir da adesão" });
            }
            if (!isValidCnes(cnes)) {
                return res.status(400).json({ ok: false, error: "CNES do estabelecimento inválido" });
            }
            if (!curso_id || !String(curso_id).trim()) {
                return res.status(400).json({ ok: false, error: "Aprimoramento (curso_id) é obrigatório para desistir da adesão" });
            }
            // ✅ importante: desistência NÃO exige cursos[] e NÃO exige quantidade
        }
        else if (tipoAcao === "MUDANCA_CURSO") {
            const rem = Array.isArray(cursosRemover) ? cursosRemover : [];
            const add = Array.isArray(cursosAdicionar) ? cursosAdicionar : [];
            const temAlgo = rem.length > 0 || add.length > 0 || cursosArr.some((c) => String(c.operacao ?? "").trim() !== "");
            if (!temAlgo) {
                return res.status(400).json({ ok: false, error: "Informe ao menos um curso para mudança" });
            }
        }
        else {
            if (cursosArr.length === 0) {
                return res.status(400).json({ ok: false, error: "Informe ao menos um curso" });
            }
        }
        await client.query("BEGIN");
        // Valida gestor
        const gestorCheck = await client.query(`SELECT id, cpf, nome, email FROM recursos.gestores WHERE id = $1`, [
            Number(gestorId),
        ]);
        if (gestorCheck.rows.length === 0) {
            return rollbackAndReturn(400, { ok: false, error: "gestorId não encontrado" });
        }
        // Resolve municipio_id
        let municipioId;
        try {
            municipioId = await resolveMunicipioId(client, municipio_id, municipioSelecionado);
        }
        catch (err) {
            return rollbackAndReturn(400, { ok: false, error: err?.message || "Município inválido" });
        }
        // Valida UF x município
        try {
            await validarUfDoMunicipio(client, municipioId, ufNorm);
        }
        catch (err) {
            return rollbackAndReturn(400, { ok: false, error: err?.message || "UF inválida" });
        }
        // ======================
        // ✅ DESCREDENCIAR_VAGA (desistir)
        // ======================
        if (tipoAcao === "DESCREDENCIAR_VAGA") {
            const cnesClean = sanitizeCnes(cnes);
            const est = await getEstByCnes(client, cnesClean);
            if (!est) {
                return rollbackAndReturn(400, { ok: false, error: `Estabelecimento CNES "${cnesClean}" não encontrado` });
            }
            if (Number(est.municipio_id) !== Number(municipioId)) {
                return rollbackAndReturn(400, { ok: false, error: "Estabelecimento não pertence ao município selecionado" });
            }
            const cursoIdNum = toInt(curso_id);
            if (!Number.isFinite(cursoIdNum)) {
                return rollbackAndReturn(400, { ok: false, error: "curso_id inválido" });
            }
            // valida se curso pertence ao estabelecimento
            const cursoCheck = await client.query(`SELECT id FROM recursos.cursos WHERE id = $1 AND estabelecimento_id = $2`, [cursoIdNum, Number(est.id)]);
            if (cursoCheck.rows.length === 0) {
                return rollbackAndReturn(400, { ok: false, error: "Aprimoramento não pertence ao estabelecimento selecionado" });
            }
            // ✅ curso_nome removido (coluna não existe em acoes_vagas)
            const acaoResult = await client.query(`
        INSERT INTO recursos.acoes_vagas
          (gestor_id, tipo_acao, uf, municipio_id, estabelecimento_id, curso_id, motivo_descredenciamento, quantidade, data_criacao)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, 0, NOW())
        RETURNING id
        `, [Number(gestorId), tipoAcao, ufNorm, municipioId, Number(est.id), cursoIdNum, String(motivoDescredenciar)]);
            await client.query("COMMIT");
            return res.status(201).json({
                ok: true,
                acao_id: acaoResult.rows[0].id,
                gestor: gestorCheck.rows[0],
                message: "Desistência registrada com sucesso",
            });
        }
        // ======================
        // ✅ MUDANCA_CURSO
        // ======================
        if (tipoAcao === "MUDANCA_CURSO") {
            try {
                const { acaoIdsCriados, estabelecimentoId } = await processarMudancaCursoPorOperacao({
                    client,
                    gestorId: Number(gestorId),
                    ufNorm,
                    municipioId,
                    cursosArr,
                    cursosRemover: Array.isArray(cursosRemover) ? cursosRemover : undefined,
                    cursosAdicionar: Array.isArray(cursosAdicionar) ? cursosAdicionar : undefined,
                });
                await client.query("COMMIT");
                return res.status(201).json({
                    ok: true,
                    acao_ids: acaoIdsCriados,
                    estabelecimento_id: estabelecimentoId,
                    gestor: gestorCheck.rows[0],
                    message: "Mudança de curso processada com sucesso (diminuir/aumentar gerados).",
                });
            }
            catch (err) {
                return rollbackAndReturn(400, { ok: false, error: err?.message || "Erro na mudança de curso" });
            }
        }
        // ======================
        // ✅ Demais ações (AUMENTAR/DIMINUIR/INCLUIR_APRIMORAMENTO/ADESAO_EDITAL)
        // ======================
        const acaoIdsCriados = [];
        for (const curso of cursosArr) {
            const quantidade = Number(curso.quantidade);
            if (!isFinitePositive(quantidade)) {
                return rollbackAndReturn(400, {
                    ok: false,
                    error: `Quantidade inválida para o curso "${curso.nome ?? curso.id}"`,
                });
            }
            const cnesItem = sanitizeCnes(curso.cnes);
            if (!cnesItem) {
                return rollbackAndReturn(400, { ok: false, error: "CNES é obrigatório em cada curso enviado" });
            }
            const est = await getEstByCnes(client, cnesItem);
            if (!est) {
                return rollbackAndReturn(400, { ok: false, error: `Estabelecimento CNES "${cnesItem}" não encontrado` });
            }
            if (Number(est.municipio_id) !== Number(municipioId)) {
                return rollbackAndReturn(400, {
                    ok: false,
                    error: `Estabelecimento (CNES ${cnesItem}) não pertence ao município selecionado`,
                });
            }
            const estabelecimentoId = Number(est.id);
            let cursoId;
            try {
                cursoId = await resolveCursoId({ client, tipoAcao, curso, estabelecimentoId });
            }
            catch (err) {
                return rollbackAndReturn(400, { ok: false, error: err?.message || "Curso inválido" });
            }
            if (tipoAcao === "DIMINUIR_VAGAS") {
                const saldo = await getSaldoSolicitadoCurso(client, cursoId, estabelecimentoId);
                if (saldo <= 0) {
                    return rollbackAndReturn(400, { ok: false, error: "Não há vagas solicitadas para diminuir" });
                }
                if (quantidade > saldo) {
                    return rollbackAndReturn(400, { ok: false, error: `Você só pode diminuir até ${saldo}` });
                }
            }
            try {
                await validarConsumoDeTeto({ client, tipoAcao, cursoId, estabelecimentoId, quantidade });
            }
            catch (err) {
                return rollbackAndReturn(400, { ok: false, error: err?.message || "Saldo insuficiente" });
            }
            const createdAcao = await client.query(`
        INSERT INTO recursos.acoes_vagas
          (gestor_id, tipo_acao, uf, municipio_id, estabelecimento_id, curso_id, quantidade, data_criacao)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
        `, [Number(gestorId), tipoAcao, ufNorm, municipioId, estabelecimentoId, cursoId, quantidade]);
            acaoIdsCriados.push(Number(createdAcao.rows[0].id));
        }
        await client.query("COMMIT");
        return res.status(201).json({
            ok: true,
            acao_ids: acaoIdsCriados,
            gestor: gestorCheck.rows[0],
            message: "Ação de vagas criada com sucesso",
        });
    }
    catch (error) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        console.error("Erro ao criar ação de vagas:", error);
        return res.status(500).json({
            ok: false,
            error: error?.message || "Erro interno ao processar a ação",
        });
    }
    finally {
        client.release();
    }
}
