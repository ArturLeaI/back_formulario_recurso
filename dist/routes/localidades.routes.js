"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const localidades_controller_1 = require("../controllers/localidades.controller");
const router = (0, express_1.Router)();
// GET /localidades/estados
router.get("/estados", localidades_controller_1.listarEstados);
// GET /localidades/municipios?uf=SP
router.get("/municipios", localidades_controller_1.listarMunicipiosPorUF);
exports.default = router;
