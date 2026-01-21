"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const estabelecimento_controller_1 = require("../controllers/estabelecimento.controller");
const router = (0, express_1.Router)();
router.get("/", estabelecimento_controller_1.listarEstabelecimentos);
router.get("/cursos", estabelecimento_controller_1.listarCursosPorEstabelecimento);
router.get("/todos-cursos", estabelecimento_controller_1.listarTodosCursos);
exports.default = router;
