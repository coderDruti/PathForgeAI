import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { mlClient } from "../src/services/mlClient.js";

let mongoServer: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri("career_recommender_test"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

describe("Career Recommender Express API Integration", () => {
  it("registers a user, updates profile, fetches recommendations, and tracks roadmap progress", async () => {
    // 1. Register
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Priya Dev",
      email: "priya@example.com",
      password: "Password123!",
    });
    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeTruthy();
    const token = regRes.body.token as string;

    // 2. Update profile
    const profRes = await request(app)
      .put("/api/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        summary: "MERN engineer pivoting to Gen AI",
        skills: [
          { skillId: "react", name: "React", proficiency: "advanced" },
          { skillId: "python", name: "Python", proficiency: "intermediate" },
        ],
        interests: ["Generative AI"],
        experienceYears: 2,
        weeklyHours: 12,
        workStyle: "product",
      });
    expect(profRes.status).toBe(200);
    expect(profRes.body.profile.skills).toHaveLength(2);

    // 3. Feedback (save role)
    const fbRes = await request(app)
      .post("/api/profile/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: "genai_engineer", action: "save" });
    expect(fbRes.status).toBe(200);
    expect(fbRes.body.profile.savedRoleIds).toContain("genai_engineer");

    // 4. Generate & persist roadmap (mock ML microservice response)
    vi.spyOn(mlClient, "generateRoadmap").mockResolvedValue({
      role_id: "genai_engineer",
      role_title: "Generative AI / LLM Engineer",
      domain: "AI & Machine Learning",
      readiness_score: 58.5,
      estimated_total_hours: 56,
      estimated_total_weeks: 5,
      generation_mode: "fallback",
      personalized_summary: "Structured path into Gen AI.",
      nodes: [
        {
          id: "python",
          skill_id: "python",
          label: "Python",
          category: "Languages",
          status: "completed",
          priority: "core",
          estimated_hours: 0,
          week_start: 0,
          week_end: 0,
          depth: 0,
          objective: "Already strong.",
          project_idea: "CLI tool",
          resources: [],
        },
        {
          id: "embeddings_nlp",
          skill_id: "embeddings_nlp",
          label: "NLP & Semantic Embeddings",
          category: "ML & Gen AI",
          status: "unlocked",
          priority: "core",
          estimated_hours: 24,
          week_start: 1,
          week_end: 2,
          depth: 1,
          objective: "Learn dense retrieval.",
          project_idea: "Semantic search engine",
          resources: [],
        },
        {
          id: "llm_rag",
          skill_id: "llm_rag",
          label: "LLM Engineering & RAG",
          category: "ML & Gen AI",
          status: "locked",
          priority: "core",
          estimated_hours: 32,
          week_start: 3,
          week_end: 5,
          depth: 2,
          objective: "Build grounded RAG.",
          project_idea: "Citation RAG assistant",
          resources: [],
        },
      ],
      edges: [
        { id: "python->embeddings_nlp", source: "python", target: "embeddings_nlp" },
        { id: "embeddings_nlp->llm_rag", source: "embeddings_nlp", target: "llm_rag" },
      ],
      capstone_project: {
        title: "Production RAG Platform",
        overview: "End-to-end RAG with evals.",
        key_features: ["Hybrid search"],
        tech_stack: ["Python", "FastAPI", "RAG"],
        resume_bullet_template: "Built RAG platform.",
      },
      interview_questions: ["Explain hybrid BM25 + vector retrieval."],
    });

    const genRes = await request(app)
      .post("/api/roadmaps/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: "genai_engineer" });
    expect(genRes.status).toBe(201);
    const roadmapId = genRes.body.roadmap._id as string;

    // 5. Complete 'embeddings_nlp' node -> should unlock 'llm_rag' and sync skill to profile
    const patchRes = await request(app)
      .patch(`/api/roadmaps/${roadmapId}/nodes/embeddings_nlp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });
    expect(patchRes.status).toBe(200);
    const ragNode = patchRes.body.roadmap.nodes.find((n: { id: string }) => n.id === "llm_rag");
    expect(ragNode.status).toBe("unlocked");
    expect(patchRes.body.roadmap.readinessScoreCurrent).toBeGreaterThanOrEqual(58.5);

    // Verify skill synced to CareerProfile
    const updatedProf = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(
      updatedProf.body.profile.skills.some((s: { skillId?: string }) => s.skillId === "embeddings_nlp")
    ).toBe(true);
  });

  it("rejects unauthorized access and invalid payloads", async () => {
    const unauth = await request(app).get("/api/profile");
    expect(unauth.status).toBe(401);

    const badReg = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "not-an-email",
      password: "123",
    });
    expect(badReg.status).toBe(400);
    expect(badReg.body.error).toBe("VALIDATION_ERROR");
  });
});
