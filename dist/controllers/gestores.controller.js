"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.criarOuBuscarGestor = criarOuBuscarGestor;
const pool_1 = require("../db/pool");
const gestor_schema_1 = require("../schemas/gestor.schema");
async function criarOuBuscarGestor(req, res) {
    const client = await pool_1.pool.connect();
    try {
        // 1️⃣ Validação (Zod)
        const dados = gestor_schema_1.gestorSchema.parse(req.body);
        const { nome, cpf, email } = dados;
        await client.query("BEGIN");
        // 2️⃣ Verifica se já existe gestor com esse CPF
        const existente = await client.query(`
      SELECT id, nome, cpf, email
      FROM recursos.gestores
      WHERE cpf = $1
      LIMIT 1
      `, [cpf]);
        if (existente.rows.length > 0) {
            await client.query("COMMIT");
            return res.status(200).json({
                ok: true,
                message: "Gestor já existente",
                gestor: existente.rows[0],
            });
        }
        // 3️⃣ Insere novo gestor
        const insert = await client.query(`
      INSERT INTO recursos.gestores (nome, cpf, email)
      VALUES ($1, $2, $3)
      RETURNING id, nome, cpf, email
      `, [nome, cpf, email]);
        await client.query("COMMIT");
        return res.status(201).json({
            ok: true,
            message: "Gestor criado com sucesso",
            gestor: insert.rows[0],
        });
    }
    catch (err) {
        await client.query("ROLLBACK");
        // Erro de validação (Zod)
        if (err?.issues) {
            return res.status(400).json({
                ok: false,
                errors: err.issues,
            });
        }
        console.error("Erro ao criar/buscar gestor:", err);
        return res.status(500).json({
            ok: false,
            error: "Erro interno ao processar gestor",
        });
    }
    finally {
        client.release();
    }
}
