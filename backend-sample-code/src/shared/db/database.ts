import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } from "../config.js";
import type { Database } from "./types.js";

const { Pool } = pg;

const dialect = new PostgresDialect({
  pool: new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    max: 10,
  }),
});

export const db = new Kysely<Database>({ dialect });
