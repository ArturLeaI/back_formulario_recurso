import { Pool } from "pg";

export const pool = new Pool({
  host: "mainline.proxy.rlwy.net",
  port: 24199,
  user: "postgres",
  password: "SuBZbqMrLULlRcDeqoPJNINoXMfFvZDS",
  database: "railway",
});