"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnitOfWork = void 0;
const pg_1 = require("./pg");
class UnitOfWork {
    pool;
    constructor(pool = (0, pg_1.getPgPool)()) {
        this.pool = pool;
    }
    async execute(work) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await work(client);
            await client.query("COMMIT");
            return result;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.UnitOfWork = UnitOfWork;
