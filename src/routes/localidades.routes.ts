import { Router } from "express";
import {
  listarEstados,
  listarMunicipiosPorUF,
} from "../controllers/localidades.controller";

const router = Router();

// GET /localidades/estados
router.get("/estados", listarEstados);

// GET /localidades/municipios?uf=SP
router.get("/municipios", listarMunicipiosPorUF);

export default router;