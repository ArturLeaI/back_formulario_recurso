import { Router } from "express";
import {
  listarEstados,
  listarMunicipiosPorUF,
} from "../controllers/localidades.controller";

const router = Router();

router.get("/estados", listarEstados);
router.get("/municipios", listarMunicipiosPorUF);

export default router;