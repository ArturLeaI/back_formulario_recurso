"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const acoes_vagas_controller_1 = require("../controllers/acoes-vagas.controller");
const estabelecimento_controller_1 = require("../controllers/estabelecimento.controller");
const router = (0, express_1.Router)();
router.post("/acoes-vagas", acoes_vagas_controller_1.criarAcaoVagasFormularioSemAuth);
router.get("/cursos", estabelecimento_controller_1.listarCursosPorEstabelecimento);
exports.default = router;
