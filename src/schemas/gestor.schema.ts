import { z } from "zod";

export const gestorSchema = z.object({
  nome: z.string().min(3),
  cpf: z.string().length(11),
  email: z.string().email(),
  nivelGestao: z.enum(["municipal", "estadual"]),
});