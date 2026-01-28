"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app_1 = __importDefault(require("./app"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
app_1.default.listen(8080, () => {
    console.log("Backend rodando em http://localhost:8080");
});
const isProd = process.env.RAILWAY_ENVIRONMENT === "production" || process.env.NODE_ENV === "production";
const LOCAL_TEST_DIR = path_1.default.join(__dirname, "../uploads");
const DEFAULT_PROD_DIR = fs_1.default.existsSync("/uploads") ? "/uploads" : path_1.default.join(process.cwd(), "uploads");
const PROD_DIR = process.env.UPLOAD_DIR ?? DEFAULT_PROD_DIR;
const UPLOAD_DIR = isProd ? PROD_DIR : LOCAL_TEST_DIR;
fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
// ✅ expõe /uploads/<arquivo>.pdf
app_1.default.use("/uploads", express_1.default.static(UPLOAD_DIR, {
    setHeaders(res, filePath) {
        if (filePath.toLowerCase().endsWith(".pdf")) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "inline");
        }
    },
}));
