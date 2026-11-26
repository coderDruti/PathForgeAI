import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateBody } from "../middleware/validate.js";
import { CareerProfile, Proficiency } from "../models/CareerProfile.js";
import { mlClient } from "../services/mlClient.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const skillSchema = z.object({
  skillId: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  proficiency: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
});

const updateProfileSchema = z.object({
  summary: z.string().max(1500).optional(),
  skills: z.array(skillSchema).max(60).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  experienceYears: z.number().min(0).max(40).optional(),
  weeklyHours: z.number().int().min(1).max(60).optional(),
  targetTimelineWeeks: z.number().int().min(2).max(104).optional(),
  workStyle: z.enum(["product", "research", "infrastructure", "leadership", "any"]).optional(),
});

const feedbackSchema = z.object({
  roleId: z.string().min(1),
  action: z.enum(["save", "unsave", "dismiss", "undismiss"]),
});

async function getOrCreateProfile(userId: string) {
  let profile = await CareerProfile.findOne({ userId });
  if (!profile) {
    profile = await CareerProfile.create({ userId });
  }
  return profile;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.userId!);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.put("/", requireAuth, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const updates = req.body as z.infer<typeof updateProfileSchema>;
    const profile = await CareerProfile.findOneAndUpdate(
      { userId: req.userId },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.post("/resume", requireAuth, upload.single("resume"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, "MISSING_FILE", "Please attach a PDF file under the 'resume' field.");
    }
    if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
      throw new AppError(400, "INVALID_FILE_TYPE", "Only PDF resume files are supported.");
    }

    const parsed = await mlClient.parseResume(req.file.buffer, req.file.originalname, req.requestId);
    const profile = await getOrCreateProfile(req.userId!);

    // Merge extracted skills with existing skills without duplicating
    const existingByKey = new Map(
      profile.skills.map((s) => [(s.skillId || s.name).toLowerCase(), s])
    );
    for (const s of parsed.extracted_skills) {
      const key = (s.skill_id || s.name).toLowerCase();
      if (!existingByKey.has(key)) {
        existingByKey.set(key, {
          skillId: s.skill_id,
          name: s.name,
          proficiency: (s.proficiency as Proficiency) || "intermediate",
        });
      }
    }

    profile.skills = Array.from(existingByKey.values());
    profile.resumeFilename = parsed.filename;
    if (!profile.summary && parsed.summary) {
      profile.summary = parsed.summary;
    }
    if (profile.interests.length === 0 && parsed.suggested_interests.length > 0) {
      profile.interests = parsed.suggested_interests;
    }
    if (parsed.inferred_experience_years > 0 && profile.experienceYears === 1) {
      profile.experienceYears = parsed.inferred_experience_years;
    }

    await profile.save();
    res.json({ parsed, profile });
  } catch (err) {
    next(err);
  }
});

router.post("/feedback", requireAuth, validateBody(feedbackSchema), async (req, res, next) => {
  try {
    const { roleId, action } = req.body as z.infer<typeof feedbackSchema>;
    const profile = await getOrCreateProfile(req.userId!);

    const saved = new Set(profile.savedRoleIds);
    const dismissed = new Set(profile.dismissedRoleIds);

    if (action === "save") {
      saved.add(roleId);
      dismissed.delete(roleId);
    } else if (action === "unsave") {
      saved.delete(roleId);
    } else if (action === "dismiss") {
      dismissed.add(roleId);
      saved.delete(roleId);
    } else if (action === "undismiss") {
      dismissed.delete(roleId);
    }

    profile.savedRoleIds = Array.from(saved);
    profile.dismissedRoleIds = Array.from(dismissed);
    await profile.save();

    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

export default router;
