import { Router } from "express";
import localidadesRoutes from "./localidades.routes";
import gestoresRoutes from "./gestores.routes";
import estabelecimentosRoutes from "./estabelecimentos.routes";
import acoesVagasRoutes from "./acoes-vagas.routes";

const routes = Router();

routes.use("/localidades", localidadesRoutes);
routes.use("/gestores", gestoresRoutes);
routes.use("/estabelecimentos", estabelecimentosRoutes);
routes.use("/recursos", acoesVagasRoutes);


export default routes;