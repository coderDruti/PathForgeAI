from collections import deque
import pytest

from app.core.config import Settings, BASE_DIR
from app.schemas.models import (
    RoadmapRequest,
    SimulateRequest,
    UserProfileInput,
    UserSkillInput,
)
from app.services.embeddings import EmbeddingService
from app.services.llm_provider import LLMProvider
from app.services.recommender import HybridCareerRecommender
from app.services.resume_parser import ResumeParser
from app.services.roadmap_generator import GroundedRoadmapGenerator
from app.services.skill_matcher import SkillMatcher
from app.services.taxonomy import TaxonomyStore


@pytest.fixture(scope="module")
def services():
    taxonomy = TaxonomyStore(BASE_DIR / "data")
    # Fast deterministic offline embedding backend for unit tests
    embeddings = EmbeddingService(backend="tfidf_svd")
    corpus = [taxonomy.role_document_text(r) for r in taxonomy.list_roles()] + [
        taxonomy.skill_document_text(s) for s in taxonomy.skills.values()
    ]
    embeddings.fit_corpus(corpus)
    matcher = SkillMatcher(taxonomy, embeddings)
    recommender = HybridCareerRecommender(taxonomy, embeddings, matcher)
    llm = LLMProvider(Settings(llm_provider="fallback", gemini_api_key="", openai_api_key=""))
    roadmap = GroundedRoadmapGenerator(taxonomy, matcher, recommender, llm)
    parser = ResumeParser(taxonomy)
    return taxonomy, matcher, recommender, roadmap, parser


def test_taxonomy_referential_integrity_and_dag_acyclicity(services):
    taxonomy, *_ = services
    assert len(taxonomy.skills) >= 50
    assert len(taxonomy.roles) >= 25

    # Every prerequisite must exist
    for sid, skill in taxonomy.skills.items():
        for prereq in skill.prerequisites:
            assert prereq in taxonomy.skills, f"Missing prerequisite '{prereq}' for skill '{sid}'"

    # Every role skill must exist
    for rid, role in taxonomy.roles.items():
        for sid in list(role.core_skills.keys()) + list(role.nice_to_have_skills.keys()):
            assert sid in taxonomy.skills, f"Missing skill '{sid}' referenced in role '{rid}'"

    # Verify global prerequisite graph is acyclic via Kahn's algorithm
    in_deg = {sid: 0 for sid in taxonomy.skills}
    adj = {sid: [] for sid in taxonomy.skills}
    for sid, skill in taxonomy.skills.items():
        for pre in skill.prerequisites:
            adj[pre].append(sid)
            in_deg[sid] += 1

    q = deque([sid for sid, d in in_deg.items() if d == 0])
    visited = 0
    while q:
        curr = q.popleft()
        visited += 1
        for nxt in adj[curr]:
            in_deg[nxt] -= 1
            if in_deg[nxt] == 0:
                q.append(nxt)
    assert visited == len(taxonomy.skills), "Cycle detected in skills_graph.json!"


def test_skill_matcher_resolves_aliases_and_deduplicates(services):
    _, matcher, *_ = services
    resolved_map, resolved_list = matcher.resolve_user_skills(
        [
            UserSkillInput(name="ReactJS", proficiency="beginner"),
            UserSkillInput(name="react.js", proficiency="advanced"),
            UserSkillInput(name="k8s", proficiency="intermediate"),
            UserSkillInput(name="RAG", proficiency="intermediate"),
        ]
    )
    assert resolved_map["react"] == "advanced"
    assert resolved_map["kubernetes"] == "intermediate"
    assert resolved_map["llm_rag"] == "intermediate"
    assert len([s for s in resolved_list if s.skill_id == "react"]) == 1


def test_hybrid_recommender_ranks_genai_and_respects_feedback(services):
    _, _, recommender, *_ = services
    profile = UserProfileInput(
        summary="Building RAG applications, vector search pipelines, FastAPI services, and AI agents in Python.",
        skills=[
            UserSkillInput(name="Python", proficiency="advanced"),
            UserSkillInput(name="LangChain", proficiency="advanced"),
            UserSkillInput(name="FastAPI", proficiency="advanced"),
            UserSkillInput(name="Qdrant", proficiency="intermediate"),
            UserSkillInput(name="Embeddings", proficiency="intermediate"),
            UserSkillInput(name="Docker", proficiency="intermediate"),
        ],
        interests=["Generative AI", "LLM Systems"],
        experience_years=2.5,
        weekly_hours=12,
        target_timeline_weeks=16,
        work_style="product",
    )
    resp = recommender.recommend(profile)
    top3_ids = [r.role_id for r in resp.recommendations[:3]]
    assert "genai_engineer" in top3_ids

    # Dismissing genai_engineer should noticeably drop its score
    before_score = next(r.match_score for r in resp.recommendations if r.role_id == "genai_engineer")
    dismissed_profile = profile.model_copy(update={"dismissed_role_ids": ["genai_engineer"]})
    after_resp = recommender.recommend(dismissed_profile)
    after_score = next(r.match_score for r in after_resp.recommendations if r.role_id == "genai_engineer")
    assert after_score < before_score - 10.0


def test_what_if_simulator_computes_positive_deltas(services):
    _, _, recommender, *_ = services
    profile = UserProfileInput(
        summary="MERN developer wanting to move into MLOps and Cloud infrastructure.",
        skills=[
            UserSkillInput(name="JavaScript", proficiency="advanced"),
            UserSkillInput(name="Node.js", proficiency="advanced"),
            UserSkillInput(name="Python", proficiency="intermediate"),
        ],
        interests=["MLOps", "Cloud"],
        experience_years=2.0,
    )
    sim = recommender.simulate_skills(
        SimulateRequest(
            profile=profile,
            hypothetical_skills=[
                UserSkillInput(name="Docker", proficiency="advanced"),
                UserSkillInput(name="Kubernetes", proficiency="advanced"),
                UserSkillInput(name="MLflow", proficiency="advanced"),
            ],
            focus_role_id="mlops_engineer",
        )
    )
    assert sim.focus_role is not None
    assert sim.focus_role.score_delta > 10.0
    assert sim.focus_role.after_weeks < sim.focus_role.before_weeks
    assert len(sim.top_movers) > 0


def test_roadmap_generator_produces_valid_acyclic_dag(services):
    _, _, _, roadmap_gen, _ = services
    profile = UserProfileInput(
        summary="Full-stack engineer pivoting into Gen AI.",
        skills=[
            UserSkillInput(name="Python", proficiency="advanced"),
            UserSkillInput(name="REST APIs", proficiency="advanced"),
        ],
        weekly_hours=10,
    )
    resp = roadmap_gen.generate(RoadmapRequest(profile=profile, role_id="genai_engineer"))
    assert resp.role_id == "genai_engineer"
    assert resp.generation_mode == "fallback"
    assert len(resp.nodes) >= 6
    assert len(resp.edges) >= 3
    assert len(resp.interview_questions) >= 4
    assert resp.capstone_project.title

    node_by_id = {n.id: n for n in resp.nodes}
    assert node_by_id["python"].status == "completed"
    # Every edge must connect existing nodes and respect topological depth
    for edge in resp.edges:
        assert edge.source in node_by_id
        assert edge.target in node_by_id
        assert node_by_id[edge.source].depth < node_by_id[edge.target].depth


def test_resume_parser_extracts_skills_and_experience(services):
    *_, parser = services
    sample_text = """
    Alex Rivera — Software Engineer
    Summary: 4 years of experience building scalable web applications and Generative AI services.
    Skills: Python, TypeScript, React.js, Node.js, MongoDB, FastAPI, Docker, RAG, Qdrant.
    Experience: Led production React and FastAPI microservices architecture (2022 - 2026).
    """
    parsed = parser.parse_text(sample_text, filename="alex_resume.pdf")
    ids = {s.skill_id for s in parsed.extracted_skills}
    assert {"python", "typescript", "react", "nodejs", "mongodb", "fastapi", "docker", "llm_rag"}.issubset(ids)
    assert parsed.inferred_experience_years == 4.0


def test_llm_provider_omits_temperature_for_openai_and_fails_over_from_gemini_503(monkeypatch):
    from types import SimpleNamespace
    import openai as openai_mod
    from google import genai as genai_mod
    from app.schemas.models import CapstoneProject
    from app.services.llm_provider import LLMRoadmapEnrichment

    sample_enrichment = LLMRoadmapEnrichment(
        personalized_summary="Tailored Gen AI path.",
        node_enrichments=[],
        capstone_project=CapstoneProject(
            title="RAG Capstone",
            overview="Grounded RAG service.",
            key_features=["Hybrid search"],
            tech_stack=["Python", "FastAPI"],
            resume_bullet_template="Built RAG service.",
        ),
        interview_questions=["How do you evaluate RAG faithfulness?"],
    )

    gemini_calls = {"count": 0}

    class FakeGeminiClient:
        def __init__(self, api_key):
            self.models = SimpleNamespace(generate_content=self._gen)

        def _gen(self, **kwargs):
            gemini_calls["count"] += 1
            raise RuntimeError("503 UNAVAILABLE: This model is currently experiencing high demand.")

    captured_openai_kwargs = {}

    class FakeOpenAIClient:
        def __init__(self, api_key):
            self.chat = SimpleNamespace(completions=SimpleNamespace(parse=self._parse))
            self.beta = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=self._parse)))

        def _parse(self, **kwargs):
            captured_openai_kwargs.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(parsed=sample_enrichment))]
            )

    monkeypatch.setattr(genai_mod, "Client", FakeGeminiClient)
    monkeypatch.setattr(openai_mod, "OpenAI", FakeOpenAIClient)

    provider = LLMProvider(
        Settings(
            llm_provider="gemini",
            gemini_api_key="fake-gemini",
            gemini_model="gemini-3.8-flash",
            openai_api_key="fake-openai",
            openai_model="gpt-6-luna",
        ),
        retry_delay_seconds=0.0,
    )

    result, mode = provider.enrich_roadmap({"target_role": {"title": "Gen AI Engineer"}})
    assert gemini_calls["count"] == 2  # retried transient 503 before failing over
    assert mode == "openai"
    assert result is not None
    assert "temperature" not in captured_openai_kwargs

