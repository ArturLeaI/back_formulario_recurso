"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gestores_controller_1 = require("../controllers/gestores.controller");
const router = (0, express_1.Router)();
router.post("/validar", gestores_controller_1.criarOuBuscarGestor);
exports.default = router;
