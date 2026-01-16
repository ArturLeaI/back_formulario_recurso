import { Router } from "express";
import { criarAcaoVagas } from "../controllers/acoes-vagas.controller";

const router = Router();

router.post("/", criarAcaoVagas);

export default router;