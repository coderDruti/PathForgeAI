import mongoose, { Document, Schema, Types } from "mongoose";

export type Proficiency = "beginner" | "intermediate" | "advanced";
export type WorkStyle = "product" | "research" | "infrastructure" | "leadership" | "any";

export interface ISkillEntry {
  skillId?: string;
  name: string;
  proficiency: Proficiency;
}

export interface ICareerProfile extends Document {
  userId: Types.ObjectId;
  summary: string;
  resumeFilename?: string;
  skills: ISkillEntry[];
  interests: string[];
  experienceYears: number;
  weeklyHours: number;
  targetTimelineWeeks: number;
  workStyle: WorkStyle;
  savedRoleIds: string[];
  dismissedRoleIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SkillEntrySchema = new Schema<ISkillEntry>(
  {
    skillId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    proficiency: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "intermediate",
    },
  },
  { _id: false }
);

const CareerProfileSchema = new Schema<ICareerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    summary: { type: String, default: "", maxlength: 1500 },
    resumeFilename: { type: String },
    skills: { type: [SkillEntrySchema], default: [] },
    interests: { type: [String], default: [] },
    experienceYears: { type: Number, default: 1, min: 0, max: 40 },
    weeklyHours: { type: Number, default: 10, min: 1, max: 60 },
    targetTimelineWeeks: { type: Number, default: 16, min: 2, max: 104 },
    workStyle: {
      type: String,
      enum: ["product", "research", "infrastructure", "leadership", "any"],
      default: "any",
    },
    savedRoleIds: { type: [String], default: [] },
    dismissedRoleIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const CareerProfile = mongoose.model<ICareerProfile>("CareerProfile", CareerProfileSchema);
