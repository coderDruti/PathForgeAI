import anyio
import httpx
import pytest

from app.core.config import settings
from app.main import app, init_services


@pytest.fixture(scope="module", autouse=True)
def setup_app():
    settings.embedding_backend = "tfidf_svd"
    settings.llm_provider = "fallback"
    init_services()


def request_app(method: str, url: str, **kwargs) -> httpx.Response:
    async def _send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, url, **kwargs)

    return anyio.run(_send)


def test_health_and_request_id():
    res = request_app("GET", "/health", headers={"X-Request-Id": "test-req-123"})
    assert res.status_code == 200
    assert res.headers["X-Request-Id"] == "test-req-123"
    body = res.json()
    assert body["status"] == "ok"
    assert body["skills_count"] >= 50
    assert body["roles_count"] >= 25


def test_taxonomy_endpoints():
    skills_res = request_app("GET", "/api/v1/taxonomy/skills")
    roles_res = request_app("GET", "/api/v1/taxonomy/roles")
    assert skills_res.status_code == 200
    assert roles_res.status_code == 200
    assert len(skills_res.json()) >= 50
    assert len(roles_res.json()) >= 25


def test_recommend_simulate_and_roadmap_flow():
    profile = {
        "summary": "Full-stack MERN developer exploring Generative AI and FastAPI.",
        "skills": [
            {"name": "React", "proficiency": "advanced"},
            {"name": "Node.js", "proficiency": "advanced"},
            {"name": "MongoDB", "proficiency": "intermediate"},
            {"name": "Python", "proficiency": "intermediate"},
        ],
        "interests": ["Generative AI", "Full-Stack"],
        "experience_years": 2,
        "weekly_hours": 10,
        "target_timeline_weeks": 16,
        "work_style": "product",
    }

    rec = request_app("POST", "/api/v1/recommend", json=profile)
    assert rec.status_code == 200
    recs = rec.json()["recommendations"]
    assert len(recs) >= 25
    assert recs[0]["match_score"] >= recs[-1]["match_score"]

    sim = request_app(
        "POST",
        "/api/v1/simulate",
        json={
            "profile": profile,
            "hypothetical_skills": [{"name": "LLM Engineering & RAG", "proficiency": "advanced"}],
            "focus_role_id": "ai_application_engineer",
        },
    )
    assert sim.status_code == 200
    assert sim.json()["focus_role"]["score_delta"] > 0

    rm = request_app(
        "POST",
        "/api/v1/roadmap/generate",
        json={"profile": profile, "role_id": "ai_application_engineer"},
    )
    assert rm.status_code == 200
    body = rm.json()
    assert body["role_id"] == "ai_application_engineer"
    assert len(body["nodes"]) > 0
    assert "capstone_project" in body


def test_roadmap_unknown_role_returns_404():
    res = request_app(
        "POST",
        "/api/v1/roadmap/generate",
        json={"profile": {"skills": []}, "role_id": "nonexistent_role"},
    )
    assert res.status_code == 404


def test_resume_parse_rejects_non_pdf():
    res = request_app(
        "POST",
        "/api/v1/resume/parse",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 400
