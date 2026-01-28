"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
// src/db/pool.ts
const pg_1 = require("pg");
require("dotenv/config");
function must(name) {
    const v = process.env[name];
    if (!v) {
        throw new Error(`ENV ${name} não definida`);
    }
    return v;
}
exports.pool = new pg_1.Pool({
    host: must("DB_HOST"),
    port: Number(must("DB_PORT")),
    user: must("DB_USER"),
    password: must("DB_PASSWORD"),
    database: must("DB_NAME"),
    // ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
