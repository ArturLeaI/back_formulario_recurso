import { Router } from "express";
import {
  listarEstabelecimentos,
  listarCursosPorEstabelecimento,
  listarTodosCursos,
} from "../controllers/estabelecimento.controller";

const router = Router();

router.get("/", listarEstabelecimentos);
router.get("/cursos", listarCursosPorEstabelecimento);
router.get("/todos-cursos", listarTodosCursos);

export default router;