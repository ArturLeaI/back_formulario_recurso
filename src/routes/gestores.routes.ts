import { Router } from "express";
import { criarOuBuscarGestor } from "../controllers/gestores.controller";

const router = Router();

router.post("/validar", criarOuBuscarGestor);


export default router;
