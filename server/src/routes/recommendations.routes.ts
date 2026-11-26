import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { CareerProfile } from "../models/CareerProfile.js";
import { mlClient, toMlProfilePayload } from "../services/mlClient.js";

const router = Router();

const simulateSchema = z.object({
  hypotheticalSkills: z
    .array(
      z.object({
        skillId: z.string().optional(),
        name: z.string().trim().min(1),
        proficiency: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
      })
    )
    .min(1)
    .max(12),
  focusRoleId: z.string().optional(),
});

router.get("/taxonomy/skills", async (req, res, next) => {
  try {
    const skills = await mlClient.listSkills(req.requestId);
    res.json({ skills });
  } catch (err) {
    next(err);
  }
});

router.get("/taxonomy/roles", async (req, res, next) => {
  try {
    const roles = await mlClient.listRoles(req.requestId);
    res.json({ roles });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let profile = await CareerProfile.findOne({ userId: req.userId });
    if (!profile) {
      profile = await CareerProfile.create({ userId: req.userId });
    }
    const payload = toMlProfilePayload(profile);
    const data = await mlClient.recommend(payload, req.requestId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/simulate", requireAuth, validateBody(simulateSchema), async (req, res, next) => {
  try {
    const { hypotheticalSkills, focusRoleId } = req.body as z.infer<typeof simulateSchema>;
    let profile = await CareerProfile.findOne({ userId: req.userId });
    if (!profile) {
      profile = await CareerProfile.create({ userId: req.userId });
    }

    const data = await mlClient.simulate(
      {
        profile: toMlProfilePayload(profile),
        hypothetical_skills: hypotheticalSkills.map((s) => ({
          skill_id: s.skillId,
          name: s.name,
          proficiency: s.proficiency,
        })),
        focus_role_id: focusRoleId,
      },
      req.requestId
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
