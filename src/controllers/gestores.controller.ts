// src/controllers/gestores.controller.ts
import { Request, Response } from "express";
import { pool } from "../db/pool";
import { gestorSchema } from "../schemas/gestor.schema";

export async function criarOuBuscarGestor(req: Request, res: Response) {
  const client = await pool.connect();

  try {
    // 1️⃣ Validação (Zod)
    const dados = gestorSchema.parse(req.body);
    const { nome, cpf, email } = dados;

    await client.query("BEGIN");

    // 2️⃣ Verifica se já existe gestor com esse CPF
    const existente = await client.query(
      `
      SELECT id, nome, cpf, email
      FROM recursos.gestores
      WHERE cpf = $1
      LIMIT 1
      `,
      [cpf]
    );

    if (existente.rows.length > 0) {
      await client.query("COMMIT");

      return res.status(200).json({
        ok: true,
        message: "Gestor já existente",
        gestor: existente.rows[0],
      });
    }

    // 3️⃣ Insere novo gestor
    const insert = await client.query(
      `
      INSERT INTO recursos.gestores (nome, cpf, email)
      VALUES ($1, $2, $3)
      RETURNING id, nome, cpf, email
      `,
      [nome, cpf, email]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      message: "Gestor criado com sucesso",
      gestor: insert.rows[0],
    });
  } catch (err: any) {
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
  } finally {
    client.release();
  }
}
