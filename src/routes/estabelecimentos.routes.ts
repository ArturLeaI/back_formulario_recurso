import { Router } from "express";
import {
  listarEstabelecimentos,
  listarCursosPorEstabelecimento,
} from "../controllers/estabelecimento.controller";

const router = Router();

router.get("/", listarEstabelecimentos);
router.get("/cursos", listarCursosPorEstabelecimento);

export default router;