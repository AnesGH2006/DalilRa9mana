import { Router, type Request } from "express";
import MinistryGradeAgent from "./MinistryGradeAgent.js";

const router = Router();

/**
 * POST /api/ministry-sync
 * Trigger automated grade sync to Tharwa
 */
router.post("/ministry-sync", async (req, res) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Only admins can trigger this
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const { classId, trimestre, annee, tharwaUsername, tharwaPassword } =
      req.body;

    // Validate input
    if (!classId || !trimestre || !annee || !tharwaUsername || !tharwaPassword) {
      res.status(400).json({ error: "Missing required parameters" });
      return;
    }

    // Run agent
    const agent = new MinistryGradeAgent();
    const result = await agent.processGrades(
      classId,
      trimestre,
      annee,
      tharwaUsername,
      tharwaPassword
    );

    res.json(result);
  } catch (error) {
    console.error("Ministry sync error:", error);
    res.status(500).json({
      error: "Grade sync failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/ministry-sync-status
 * Check pending syncs or recent results
 */
router.get("/ministry-sync-status", async (req, res) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({
      status: "ready",
      message: "Agent is ready for grade synchronization",
      last_sync: null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

export default router;