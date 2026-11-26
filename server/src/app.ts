import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import roadmapRoutes from "./routes/roadmap.routes.js";
import { mlClient } from "./services/mlClient.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "2mb" }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", limiter);

  app.get("/api/health", async (req, res) => {
    let mlStatus: Record<string, unknown> = { status: "unreachable" };
    try {
      mlStatus = await mlClient.health(req.requestId);
    } catch {
      // report degraded ml-service without failing gateway liveness
    }
    res.json({
      status: "ok",
      service: "career-recommender-server",
      requestId: req.requestId,
      mlService: mlStatus,
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/recommendations", recommendationsRoutes);
  app.use("/api/roadmaps", roadmapRoutes);

  app.use(errorHandler);
  return app;
}
