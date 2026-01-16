import { Request, Response } from "express";
import { gestorSchema } from "../schemas/gestor.schema";

export async function validarGestor(req: Request, res: Response) {
  try {
    const dados = gestorSchema.parse(req.body);

    // Por enquanto só valida
    return res.status(200).json({
      ok: true,
      message: "Dados do gestor válidos",
      dados,
    });

  } catch (err: any) {
    return res.status(400).json({
      ok: false,
      errors: err.errors ?? err.message,
    });
  }
}