import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

const UPLOAD_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "uploads")    
    : path.join(__dirname, "../uploads");    

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(routes);

export default app;
