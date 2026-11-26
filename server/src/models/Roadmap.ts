import mongoose, { Document, Schema, Types } from "mongoose";

export interface IRoadmapResource {
  title: string;
  url: string;
  type: "docs" | "course" | "book" | "video" | "practice";
  free: boolean;
}

export interface IRoadmapNode {
  id: string;
  skillId: string;
  label: string;
  category: string;
  status: "completed" | "unlocked" | "locked";
  priority: "core" | "prerequisite" | "nice_to_have";
  estimatedHours: number;
  weekStart: number;
  weekEnd: number;
  depth: number;
  objective: string;
  projectIdea: string;
  resources: IRoadmapResource[];
  completed: boolean;
  completedAt?: Date;
}

export interface IRoadmapEdge {
  id: string;
  source: string;
  target: string;
}

export interface ICapstoneProject {
  title: string;
  overview: string;
  keyFeatures: string[];
  techStack: string[];
  resumeBulletTemplate: string;
}

export interface IRoadmap extends Document {
  userId: Types.ObjectId;
  roleId: string;
  roleTitle: string;
  domain: string;
  readinessScoreInitial: number;
  readinessScoreCurrent: number;
  estimatedTotalHours: number;
  estimatedTotalWeeks: number;
  generationMode: "gemini" | "openai" | "fallback";
  personalizedSummary: string;
  nodes: IRoadmapNode[];
  edges: IRoadmapEdge[];
  capstoneProject: ICapstoneProject;
  interviewQuestions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ResourceSchema = new Schema<IRoadmapResource>(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ["docs", "course", "book", "video", "practice"], default: "docs" },
    free: { type: Boolean, default: true },
  },
  { _id: false }
);

const RoadmapNodeSchema = new Schema<IRoadmapNode>(
  {
    id: { type: String, required: true },
    skillId: { type: String, required: true },
    label: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, enum: ["completed", "unlocked", "locked"], required: true },
    priority: { type: String, enum: ["core", "prerequisite", "nice_to_have"], required: true },
    estimatedHours: { type: Number, default: 0 },
    weekStart: { type: Number, default: 0 },
    weekEnd: { type: Number, default: 0 },
    depth: { type: Number, default: 0 },
    objective: { type: String, required: true },
    projectIdea: { type: String, required: true },
    resources: { type: [ResourceSchema], default: [] },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { _id: false }
);

const RoadmapEdgeSchema = new Schema<IRoadmapEdge>(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
  },
  { _id: false }
);

const CapstoneSchema = new Schema<ICapstoneProject>(
  {
    title: { type: String, required: true },
    overview: { type: String, required: true },
    keyFeatures: { type: [String], default: [] },
    techStack: { type: [String], default: [] },
    resumeBulletTemplate: { type: String, required: true },
  },
  { _id: false }
);

const RoadmapSchema = new Schema<IRoadmap>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: String, required: true, index: true },
    roleTitle: { type: String, required: true },
    domain: { type: String, required: true },
    readinessScoreInitial: { type: Number, default: 0 },
    readinessScoreCurrent: { type: Number, default: 0 },
    estimatedTotalHours: { type: Number, default: 0 },
    estimatedTotalWeeks: { type: Number, default: 0 },
    generationMode: { type: String, enum: ["gemini", "openai", "fallback"], default: "fallback" },
    personalizedSummary: { type: String, default: "" },
    nodes: { type: [RoadmapNodeSchema], default: [] },
    edges: { type: [RoadmapEdgeSchema], default: [] },
    capstoneProject: { type: CapstoneSchema, required: true },
    interviewQuestions: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Roadmap = mongoose.model<IRoadmap>("Roadmap", RoadmapSchema);
