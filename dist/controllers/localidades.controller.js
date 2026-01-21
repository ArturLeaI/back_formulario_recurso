"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEstados = listarEstados;
exports.listarMunicipiosPorUF = listarMunicipiosPorUF;
const pool_1 = require("../db/pool");
// 🔹 Lista estados
async function listarEstados(req, res) {
    const result = await pool_1.pool.query(`
    SELECT uf, nome
    FROM recursos.estados
    ORDER BY nome
  `);
    res.json(result.rows);
}
// 🔹 Lista municípios por UF
async function listarMunicipiosPorUF(req, res) {
    const ufRaw = req.query.uf;
    const statusRaw = req.query.estabelecimento_status; // "ADERIDO" | "NAO_ADERIDO" (opcional)
    if (!ufRaw) {
        return res.status(400).json({ error: "UF é obrigatória" });
    }
    const uf = String(ufRaw).trim().toUpperCase();
    const status = String(statusRaw || "").trim().toUpperCase();
    // Só aceita esses 2 valores (se vier outra coisa, ignora filtro)
    const filtrarPorStatus = status === "ADERIDO" || status === "NAO_ADERIDO";
    const params = [uf];
    let filtroStatusSql = "";
    if (filtrarPorStatus) {
        params.push(status);
        filtroStatusSql = `
      AND EXISTS (
        SELECT 1
        FROM recursos.estabelecimentos es
        WHERE es.municipio_id = m.id
          AND es.status_adesao = $2
      )
    `;
    }
    const result = await pool_1.pool.query(`
    SELECT
      m.id AS municipio_id,
      m.nome,
      m.ibge
    FROM recursos.municipios m
    JOIN recursos.estados e ON e.id = m.estado_id
    WHERE e.uf = $1
    ${filtroStatusSql}
    ORDER BY m.nome
    `, params);
    res.json(result.rows);
}
