import { Router } from "express";
import { validarGestor } from "../controllers/gestores.controller";

const router = Router();

router.post("/validar", validarGestor);

export default router;
