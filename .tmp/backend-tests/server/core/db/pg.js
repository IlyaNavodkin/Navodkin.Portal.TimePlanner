"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPgPool = getPgPool;
const pg_1 = require("pg");
const DEFAULT_POSTGRES_PORT = 5432;
let poolSingleton = null;
function readRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function readPort() {
    const rawValue = process.env.POSTGRES_PORT ?? String(DEFAULT_POSTGRES_PORT);
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
        throw new Error(`POSTGRES_PORT must be a number, got: ${rawValue}`);
    }
    return parsed;
}
function getPgPool() {
    if (poolSingleton) {
        return poolSingleton;
    }
    poolSingleton = new pg_1.Pool({
        host: readRequiredEnv("POSTGRES_HOST"),
        port: readPort(),
        database: readRequiredEnv("POSTGRES_DB"),
        user: readRequiredEnv("POSTGRES_USER"),
        password: readRequiredEnv("POSTGRES_PASSWORD"),
        max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
        idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS ?? 30000),
    });
    return poolSingleton;
}
