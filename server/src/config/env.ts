import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/career_recommender",
  useInMemoryMongo: (process.env.USE_INMEMORY_MONGO ?? "false").toLowerCase() === "true",
  jwtSecret: process.env.JWT_SECRET ?? "dev-super-secret-change-me-in-production-32chars",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  mlServiceUrl: (process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, ""),
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS ?? 45000),
};
