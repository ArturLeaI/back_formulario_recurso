import { z } from "zod";

export const gestorSchema = z.object({
  nome: z.string().min(3, "Nome obrigatório"),
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF deve conter 11 dígitos"),
  email: z.string().email("E-mail inválido"),
});