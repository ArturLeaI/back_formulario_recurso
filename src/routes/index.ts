import { Router } from "express";
import localidadesRoutes from "./localidades.routes";
import gestoresRoutes from "./gestores.routes";
import estabelecimentosRoutes from "./estabelecimentos.routes";

const routes = Router();

routes.use("/localidades", localidadesRoutes);
routes.use("/gestores", gestoresRoutes);
routes.use("/estabelecimentos", estabelecimentosRoutes);

export default routes;