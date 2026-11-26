export type Proficiency = "beginner" | "intermediate" | "advanced";
export type WorkStyle = "product" | "research" | "infrastructure" | "leadership" | "any";
export type ReadinessTier = "best_fit" | "adjacent_pivot" | "stretch_goal";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface SkillEntry {
  skillId?: string;
  name: string;
  proficiency: Proficiency;
}

export interface CareerProfile {
  _id: string;
  userId: string;
  summary: string;
  resumeFilename?: string;
  skills: SkillEntry[];
  interests: string[];
  experienceYears: number;
  weeklyHours: number;
  targetTimelineWeeks: number;
  workStyle: WorkStyle;
  savedRoleIds: string[];
  dismissedRoleIds: string[];
}

export interface TaxonomySkill {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  prerequisites: string[];
  estimated_hours: number;
}

export interface SkillMatchDetail {
  skill_id: string;
  name: string;
  category: string;
  weight: number;
  user_proficiency?: Proficiency | null;
  status: "matched" | "partial" | "missing_core" | "missing_nice";
  estimated_hours: number;
}

export interface CategoryCoverage {
  category: string;
  user_score: number;
  required_score: number;
}

export interface RoleRecommendation {
  role_id: string;
  title: string;
  domain: string;
  level: string;
  work_style: string;
  salary_band_usd: { min: number; max: number };
  demand_trend: "high_growth" | "steady" | "emerging";
  description: string;
  match_score: number;
  readiness_tier: ReadinessTier;
  score_breakdown: {
    skill_coverage: number;
    semantic_similarity: number;
    profile_alignment: number;
    feedback_delta: number;
  };
  matched_skills: SkillMatchDetail[];
  partial_skills: SkillMatchDetail[];
  missing_core_skills: SkillMatchDetail[];
  missing_nice_skills: SkillMatchDetail[];
  category_coverage: CategoryCoverage[];
  estimated_weeks_to_ready: number;
  explanation: string;
}

export interface RecommendResponse {
  resolved_skills: { skill_id?: string; name: string; proficiency: Proficiency }[];
  recommendations: RoleRecommendation[];
  embedding_backend: string;
}

export interface SimulatedRoleDelta {
  role_id: string;
  title: string;
  domain: string;
  before_score: number;
  after_score: number;
  score_delta: number;
  before_rank: number;
  after_rank: number;
  rank_delta: number;
  before_tier: ReadinessTier;
  after_tier: ReadinessTier;
  before_weeks: number;
  after_weeks: number;
}

export interface SimulateResponse {
  added_skills: { skill_id?: string; name: string; proficiency: Proficiency }[];
  focus_role?: SimulatedRoleDelta | null;
  top_movers: SimulatedRoleDelta[];
  updated_recommendations: RoleRecommendation[];
}

export interface RoadmapResource {
  title: string;
  url: string;
  type: "docs" | "course" | "book" | "video" | "practice";
  free: boolean;
}

export interface RoadmapNodeData {
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
  resources: RoadmapResource[];
  completed: boolean;
  completedAt?: string;
}

export interface RoadmapEdgeData {
  id: string;
  source: string;
  target: string;
}

export interface Roadmap {
  _id: string;
  roleId: string;
  roleTitle: string;
  domain: string;
  readinessScoreInitial: number;
  readinessScoreCurrent: number;
  estimatedTotalHours: number;
  estimatedTotalWeeks: number;
  generationMode: "gemini" | "openai" | "fallback";
  personalizedSummary: string;
  nodes: RoadmapNodeData[];
  edges: RoadmapEdgeData[];
  capstoneProject: {
    title: string;
    overview: string;
    keyFeatures: string[];
    techStack: string[];
    resumeBulletTemplate: string;
  };
  interviewQuestions: string[];
  createdAt: string;
  updatedAt: string;
}
