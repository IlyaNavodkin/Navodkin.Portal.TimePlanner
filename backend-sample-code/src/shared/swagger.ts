import swaggerJsdoc from "swagger-jsdoc";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Koster API",
      version: "1.0.0",
      description: "Koster real-time room platform API",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        migrateSecret: {
          type: "apiKey",
          in: "header",
          name: "X-Migrate-Secret",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [path.join(__dirname, "..", "features", "*", "routes*.js"), path.join(__dirname, "..", "features", "*", "routes*.ts")],
};

export const swaggerSpec = swaggerJsdoc(options);
