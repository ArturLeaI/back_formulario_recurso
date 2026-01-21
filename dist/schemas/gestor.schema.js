"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gestorSchema = void 0;
const zod_1 = require("zod");
exports.gestorSchema = zod_1.z.object({
    nome: zod_1.z.string().min(3, "Nome obrigatório"),
    cpf: zod_1.z
        .string()
        .regex(/^\d{11}$/, "CPF deve conter 11 dígitos"),
    email: zod_1.z.string().email("E-mail inválido"),
});
