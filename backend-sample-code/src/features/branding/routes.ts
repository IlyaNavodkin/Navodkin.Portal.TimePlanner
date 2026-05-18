import { Router } from "express";
import { getBrandingRuntimeConfig } from "./usecases/BrandingRuntimeConfig.js";
import { asyncRoute } from "../../shared/middleware/async-route.js";

const router = Router();

router.get("/api/branding", asyncRoute(async (_req, res) => {
  const branding = await getBrandingRuntimeConfig();
  res.json(branding);
}));

export default router;
