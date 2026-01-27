import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

const isProd =
  process.env.RAILWAY_ENVIRONMENT === "production" || process.env.NODE_ENV === "production";
const DEFAULT_PROD_DIR = fs.existsSync("/uploads") ? "/uploads" : path.join(process.cwd(), "uploads");
const UPLOAD_DIR = isProd ? process.env.UPLOAD_DIR ?? DEFAULT_PROD_DIR : path.join(__dirname, "../uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(routes);

export default app;
