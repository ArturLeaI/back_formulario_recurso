import { Router } from "express";
import { criarAcaoVagasFormularioSemAuth } from "../controllers/acoes-vagas.controller";
import { listarCursosPorEstabelecimento } from "../controllers/estabelecimento.controller";

const router = Router();

router.post("/acoes-vagas", criarAcaoVagasFormularioSemAuth);

router.get("/cursos", listarCursosPorEstabelecimento);

export default router;