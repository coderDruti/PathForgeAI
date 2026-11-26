import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateBody } from "../middleware/validate.js";
import { CareerProfile } from "../models/CareerProfile.js";
import { IRoadmapNode, Roadmap } from "../models/Roadmap.js";
import { mlClient, toMlProfilePayload } from "../services/mlClient.js";

const router = Router();

const generateSchema = z.object({
  roleId: z.string().trim().min(1),
});

const toggleNodeSchema = z.object({
  completed: z.boolean(),
  syncProfileSkill: z.boolean().optional().default(true),
});

interface MlRoadmapRaw {
  role_id: string;
  role_title: string;
  domain: string;
  readiness_score: number;
  estimated_total_hours: number;
  estimated_total_weeks: number;
  generation_mode: "gemini" | "openai" | "fallback";
  personalized_summary: string;
  nodes: {
    id: string;
    skill_id: string;
    label: string;
    category: string;
    status: "completed" | "unlocked" | "locked";
    priority: "core" | "prerequisite" | "nice_to_have";
    estimated_hours: number;
    week_start: number;
    week_end: number;
    depth: number;
    objective: string;
    project_idea: string;
    resources: { title: string; url: string; type: "docs" | "course" | "book" | "video" | "practice"; free: boolean }[];
  }[];
  edges: { id: string; source: string; target: string }[];
  capstone_project: {
    title: string;
    overview: string;
    key_features: string[];
    tech_stack: string[];
    resume_bullet_template: string;
  };
  interview_questions: string[];
}

function recomputeNodeStates(nodes: IRoadmapNode[], edges: { source: string; target: string }[]): void {
  const completedIds = new Set(nodes.filter((n) => n.completed).map((n) => n.id));
  const prereqsByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const list = prereqsByTarget.get(edge.target) ?? [];
    list.push(edge.source);
    prereqsByTarget.set(edge.target, list);
  }

  for (const node of nodes) {
    if (node.completed) {
      node.status = "completed";
    } else {
      const prereqs = prereqsByTarget.get(node.id) ?? [];
      const unlocked = prereqs.every((p) => completedIds.has(p));
      node.status = unlocked ? "unlocked" : "locked";
    }
  }
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const roadmaps = await Roadmap.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ roadmaps });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.userId });
    if (!roadmap) {
      throw new AppError(404, "ROADMAP_NOT_FOUND", "Roadmap not found.");
    }
    res.json({ roadmap });
  } catch (err) {
    next(err);
  }
});

router.post("/generate", requireAuth, validateBody(generateSchema), async (req, res, next) => {
  try {
    const { roleId } = req.body as z.infer<typeof generateSchema>;
    let profile = await CareerProfile.findOne({ userId: req.userId });
    if (!profile) {
      profile = await CareerProfile.create({ userId: req.userId });
    }

    const mlData = (await mlClient.generateRoadmap(
      { profile: toMlProfilePayload(profile), role_id: roleId },
      req.requestId
    )) as unknown as MlRoadmapRaw;

    const mappedNodes: IRoadmapNode[] = mlData.nodes.map((n) => ({
      id: n.id,
      skillId: n.skill_id,
      label: n.label,
      category: n.category,
      status: n.status,
      priority: n.priority,
      estimatedHours: n.estimated_hours,
      weekStart: n.week_start,
      weekEnd: n.week_end,
      depth: n.depth,
      objective: n.objective,
      projectIdea: n.project_idea,
      resources: n.resources,
      completed: n.status === "completed",
      completedAt: n.status === "completed" ? new Date() : undefined,
    }));

    const roadmap = await Roadmap.findOneAndUpdate(
      { userId: req.userId, roleId: mlData.role_id },
      {
        $set: {
          roleTitle: mlData.role_title,
          domain: mlData.domain,
          readinessScoreInitial: mlData.readiness_score,
          readinessScoreCurrent: mlData.readiness_score,
          estimatedTotalHours: mlData.estimated_total_hours,
          estimatedTotalWeeks: mlData.estimated_total_weeks,
          generationMode: mlData.generation_mode,
          personalizedSummary: mlData.personalized_summary,
          nodes: mappedNodes,
          edges: mlData.edges,
          capstoneProject: {
            title: mlData.capstone_project.title,
            overview: mlData.capstone_project.overview,
            keyFeatures: mlData.capstone_project.key_features,
            techStack: mlData.capstone_project.tech_stack,
            resumeBulletTemplate: mlData.capstone_project.resume_bullet_template,
          },
          interviewQuestions: mlData.interview_questions,
        },
      },
      { new: true, upsert: true }
    );

    res.status(201).json({ roadmap });
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:id/nodes/:nodeId",
  requireAuth,
  validateBody(toggleNodeSchema),
  async (req, res, next) => {
    try {
      const { completed, syncProfileSkill } = req.body as z.infer<typeof toggleNodeSchema>;
      const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.userId });
      if (!roadmap) {
        throw new AppError(404, "ROADMAP_NOT_FOUND", "Roadmap not found.");
      }

      const targetNode = roadmap.nodes.find((n) => n.id === req.params.nodeId);
      if (!targetNode) {
        throw new AppError(404, "NODE_NOT_FOUND", "Milestone node not found in roadmap.");
      }

      targetNode.completed = completed;
      targetNode.completedAt = completed ? new Date() : undefined;

      recomputeNodeStates(roadmap.nodes, roadmap.edges);

      const totalNodes = Math.max(1, roadmap.nodes.length);
      const completedCount = roadmap.nodes.filter((n) => n.completed).length;
      const ratio = completedCount / totalNodes;
      roadmap.readinessScoreCurrent = Number(
        Math.min(100, Math.max(roadmap.readinessScoreInitial, Math.round(ratio * 1000) / 10)).toFixed(1)
      );

      await roadmap.save();

      // Close the loop: add mastered skill into the user's career profile
      if (completed && syncProfileSkill) {
        const profile = await CareerProfile.findOne({ userId: req.userId });
        if (profile) {
          const existing = profile.skills.find(
            (s) => s.skillId === targetNode.skillId || s.name.toLowerCase() === targetNode.label.toLowerCase()
          );
          if (!existing) {
            profile.skills.push({
              skillId: targetNode.skillId,
              name: targetNode.label,
              proficiency: "intermediate",
            });
            await profile.save();
          } else if (existing.proficiency === "beginner") {
            existing.proficiency = "intermediate";
            await profile.save();
          }
        }
      }

      res.json({ roadmap });
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await Roadmap.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) {
      throw new AppError(404, "ROADMAP_NOT_FOUND", "Roadmap not found.");
    }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
