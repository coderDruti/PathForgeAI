from contextlib import asynccontextmanager
import logging
import uuid
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.schemas.models import (
    ParsedResumeResponse,
    RecommendResponse,
    RoadmapRequest,
    RoadmapResponse,
    RoleDefinition,
    SimulateRequest,
    SimulateResponse,
    SkillDefinition,
    UserProfileInput,
)
from app.services.embeddings import EmbeddingService
from app.services.llm_provider import LLMProvider
from app.services.recommender import HybridCareerRecommender
from app.services.resume_parser import ResumeParser
from app.services.roadmap_generator import GroundedRoadmapGenerator
from app.services.skill_matcher import SkillMatcher
from app.services.taxonomy import TaxonomyStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ml-service")


class ServiceContainer:
    taxonomy: TaxonomyStore
    embeddings: EmbeddingService
    matcher: SkillMatcher
    resume_parser: ResumeParser
    recommender: HybridCareerRecommender
    roadmap_generator: GroundedRoadmapGenerator


container = ServiceContainer()


def init_services() -> None:
    container.taxonomy = TaxonomyStore(settings.data_dir)
    container.embeddings = EmbeddingService(
        backend=settings.embedding_backend,
        model_name=settings.embedding_model,
        gemini_api_key=settings.gemini_api_key,
        gemini_embedding_model=settings.gemini_embedding_model,
        gemini_embedding_dims=settings.gemini_embedding_dims,
    )
    # Pre-fit fallback corpus across both roles and skills before encoding
    corpus = [
        container.taxonomy.role_document_text(r)
        for r in container.taxonomy.list_roles()
    ] + [
        container.taxonomy.skill_document_text(s)
        for s in container.taxonomy.skills.values()
    ]
    container.embeddings.fit_corpus(corpus)
    container.matcher = SkillMatcher(container.taxonomy, container.embeddings)
    container.resume_parser = ResumeParser(container.taxonomy)
    container.recommender = HybridCareerRecommender(
        container.taxonomy, container.embeddings, container.matcher
    )
    llm_provider = LLMProvider(settings)
    container.roadmap_generator = GroundedRoadmapGenerator(
        container.taxonomy, container.matcher, container.recommender, llm_provider
    )
    logger.info(
        "ML service ready: %d skills, %d roles, backend=%s",
        len(container.taxonomy.skills),
        len(container.taxonomy.roles),
        container.embeddings.active_backend,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_services()
    yield


app = FastAPI(
    title="AI Career Path Recommender — ML & Gen AI Service",
    version="1.0.0",
    description="Hybrid Semantic + Skill-Graph Career Recommender, What-If Simulator, Resume Parser, and Grounded RAG Roadmap Generator.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.get("/health")
def health():
    return {
        "status": "ok",
        "skills_count": len(container.taxonomy.skills),
        "roles_count": len(container.taxonomy.roles),
        "embedding_backend": container.embeddings.active_backend,
        "llm_provider": settings.llm_provider,
    }


@app.get("/api/v1/taxonomy/skills", response_model=list[SkillDefinition])
def list_skills():
    return container.taxonomy.list_skills()


@app.get("/api/v1/taxonomy/roles", response_model=list[RoleDefinition])
def list_roles():
    return container.taxonomy.list_roles()


@app.post("/api/v1/resume/parse", response_model=ParsedResumeResponse)
async def parse_resume(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resume files are supported.")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Resume PDF exceeds 5MB limit.")
    try:
        return container.resume_parser.parse_pdf(content, filename=file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to parse resume PDF")
        raise HTTPException(status_code=422, detail="Unable to parse PDF file.") from exc


@app.post("/api/v1/recommend", response_model=RecommendResponse)
def recommend_roles(profile: UserProfileInput):
    return container.recommender.recommend(profile)


@app.post("/api/v1/simulate", response_model=SimulateResponse)
def simulate_skills(payload: SimulateRequest):
    return container.recommender.simulate_skills(payload)


@app.post("/api/v1/roadmap/generate", response_model=RoadmapResponse)
def generate_roadmap(payload: RoadmapRequest):
    try:
        return container.roadmap_generator.generate(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
