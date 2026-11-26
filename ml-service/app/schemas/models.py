from typing import Literal
from pydantic import BaseModel, Field


Proficiency = Literal["beginner", "intermediate", "advanced"]
WorkStyle = Literal["product", "research", "infrastructure", "leadership", "any"]
ReadinessTier = Literal["best_fit", "adjacent_pivot", "stretch_goal"]


class SkillResource(BaseModel):
    title: str
    url: str
    type: Literal["docs", "course", "book", "video", "practice"]
    free: bool = True


class SkillDefinition(BaseModel):
    id: str
    name: str
    category: str
    aliases: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    estimated_hours: int = 20
    resources: list[SkillResource] = Field(default_factory=list)
    project_prompts: list[str] = Field(default_factory=list)


class SalaryBand(BaseModel):
    min: int
    max: int


class RoleDefinition(BaseModel):
    id: str
    title: str
    domain: str
    level: Literal["entry", "mid", "senior"]
    work_style: Literal["product", "research", "infrastructure", "leadership"]
    salary_band_usd: SalaryBand
    demand_trend: Literal["high_growth", "steady", "emerging"]
    description: str
    core_skills: dict[str, float]
    nice_to_have_skills: dict[str, float] = Field(default_factory=dict)
    interview_topics: list[str] = Field(default_factory=list)


class UserSkillInput(BaseModel):
    skill_id: str | None = None
    name: str
    proficiency: Proficiency = "intermediate"


class UserProfileInput(BaseModel):
    summary: str = ""
    skills: list[UserSkillInput] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    experience_years: float = Field(default=1.0, ge=0, le=40)
    weekly_hours: int = Field(default=10, ge=1, le=60)
    target_timeline_weeks: int = Field(default=16, ge=2, le=104)
    work_style: WorkStyle = "any"
    saved_role_ids: list[str] = Field(default_factory=list)
    dismissed_role_ids: list[str] = Field(default_factory=list)


class SkillMatchDetail(BaseModel):
    skill_id: str
    name: str
    category: str
    weight: float
    user_proficiency: Proficiency | None = None
    status: Literal["matched", "partial", "missing_core", "missing_nice"]
    estimated_hours: int = 0


class ScoreBreakdown(BaseModel):
    skill_coverage: float
    semantic_similarity: float
    profile_alignment: float
    feedback_delta: float


class CategoryCoverage(BaseModel):
    category: str
    user_score: float
    required_score: float


class RoleRecommendation(BaseModel):
    role_id: str
    title: str
    domain: str
    level: str
    work_style: str
    salary_band_usd: SalaryBand
    demand_trend: str
    description: str
    match_score: float
    readiness_tier: ReadinessTier
    score_breakdown: ScoreBreakdown
    matched_skills: list[SkillMatchDetail]
    partial_skills: list[SkillMatchDetail]
    missing_core_skills: list[SkillMatchDetail]
    missing_nice_skills: list[SkillMatchDetail]
    category_coverage: list[CategoryCoverage]
    estimated_weeks_to_ready: int
    explanation: str


class RecommendResponse(BaseModel):
    resolved_skills: list[UserSkillInput]
    recommendations: list[RoleRecommendation]
    embedding_backend: str


class SimulateRequest(BaseModel):
    profile: UserProfileInput
    hypothetical_skills: list[UserSkillInput]
    focus_role_id: str | None = None


class SimulatedRoleDelta(BaseModel):
    role_id: str
    title: str
    domain: str
    before_score: float
    after_score: float
    score_delta: float
    before_rank: int
    after_rank: int
    rank_delta: int
    before_tier: ReadinessTier
    after_tier: ReadinessTier
    before_weeks: int
    after_weeks: int


class SimulateResponse(BaseModel):
    added_skills: list[UserSkillInput]
    focus_role: SimulatedRoleDelta | None = None
    top_movers: list[SimulatedRoleDelta]
    updated_recommendations: list[RoleRecommendation]


class ParsedResumeResponse(BaseModel):
    filename: str
    extracted_text_length: int
    inferred_experience_years: float
    summary: str
    extracted_skills: list[UserSkillInput]
    suggested_interests: list[str]


class RoadmapNode(BaseModel):
    id: str
    skill_id: str
    label: str
    category: str
    status: Literal["completed", "unlocked", "locked"]
    priority: Literal["core", "prerequisite", "nice_to_have"]
    estimated_hours: int
    week_start: int
    week_end: int
    depth: int
    objective: str
    project_idea: str
    resources: list[SkillResource] = Field(default_factory=list)


class RoadmapEdge(BaseModel):
    id: str
    source: str
    target: str


class CapstoneProject(BaseModel):
    title: str
    overview: str
    key_features: list[str]
    tech_stack: list[str]
    resume_bullet_template: str


class RoadmapRequest(BaseModel):
    profile: UserProfileInput
    role_id: str


class RoadmapResponse(BaseModel):
    role_id: str
    role_title: str
    domain: str
    readiness_score: float
    estimated_total_hours: int
    estimated_total_weeks: int
    generation_mode: Literal["gemini", "openai", "fallback"]
    personalized_summary: str
    nodes: list[RoadmapNode]
    edges: list[RoadmapEdge]
    capstone_project: CapstoneProject
    interview_questions: list[str]
