import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "../../shared/schemas.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

// Root /api probe used by the deployment promote health-check
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
