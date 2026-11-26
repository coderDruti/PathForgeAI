# PathForge AI — Career Path Recommender & Grounded RAG Roadmap Studio

An end-to-end **SDE + Gen AI** full-stack platform combining a **MERN (MongoDB, Express, React, Node.js)** application layer with a dedicated **Python FastAPI ML & Gen AI microservice**.

---

## Key Capabilities

* **Hybrid Career Recommendation Engine (`ml-service`)**
  * Combines **local dense semantic embeddings** (`sentence-transformers/all-MiniLM-L6-v2` on CPU PyTorch, with a dependency-free pure-NumPy TF-IDF + SVD offline fallback), **proficiency-weighted skill coverage**, **career-stage/timeline alignment**, and **Save / Dismiss feedback re-ranking**.
  * Produces transparent score breakdowns (`Skill Match`, `Semantic Fit`, `Alignment`) and readiness tiers (`Best Fit Now`, `Adjacent Pivot`, `Stretch Goal`) across **30 curated roles** and **65 prerequisite-linked canonical skills**.
* **Two-Stage Skill Resolver & PDF Resume Parser**
  * Drag-and-drop PDF resume upload extracts canonical skills, inferred proficiency cues, experience years, and summary snippets via `pypdf`.
  * Resolves synonyms/aliases (`ReactJS`, `k8s`, `RAG`) deterministically first, then falls back to dense semantic cosine similarity (`>= 0.72`).
* **Skill Gap Analyzer & Interactive "What-If" Skill Simulator**
  * Visualizes category-level readiness via Recharts Radar Charts (`User Coverage` vs. `Role Requirement`).
  * Toggle hypothetical missing skills to recompute match score jumps, overall rank deltas, weeks saved, and cross-role top movers in real time.
* **Grounded RAG Career Roadmap Studio (React Flow DAG)**
  * Deterministically computes an acyclic topological prerequisite **DAG** (Kahn's algorithm) scheduled across the user's weekly study hours.
  * Enriches milestones, tailored portfolio capstone projects (with copyable resume bullet templates), and interview questions via a resilient **multi-provider LLM adapter**:
    * **Primary:** Google Gemini (`google-genai`) with automatic transient `503`/`429` retry & backoff.
    * **Automatic Failover:** OpenAI (`openai` structured outputs compatible with default-temperature reasoning & newer model families).
    * **Zero-Key Fallback:** Grounded deterministic graph synthesis when no API keys are configured or cloud providers are unavailable.
  * Strictly validates all LLM-returned `skill_id` references against the deterministic DAG to prevent hallucinated prerequisites.
* **Persistent Progress & Smart Roadmap Controls**
  * Completing a skill node in the DAG Studio dynamically unlocks dependent nodes and syncs the newly mastered skill back into the user's MongoDB `CareerProfile`.
  * Both the **Recommendations Dashboard** and **Role Analysis** pages check the user's database for pre-generated roadmaps—rendering **Show Roadmap** (direct jump to DAG Studio without redundant LLM calls) + **Re-generate Roadmap** for existing tracks, and **Generate Roadmap** for new roles.

---

## Architecture

```text
React 19 + TypeScript + Tailwind + React Flow + Recharts (:5173)
        │  REST + JWT Auth
        ▼
Node.js + Express + TypeScript + Zod Gateway (:5000) ◄──► MongoDB (:27017 / Atlas / In-Memory)
        │  Internal HTTP + X-Request-Id + Retries (45s timeout)
        ▼
Python 3.12 + FastAPI ML & Gen AI Microservice (:8000)
   ├── Local Embeddings (sentence-transformers/all-MiniLM-L6-v2 + Pure-NumPy TF-IDF/SVD fallback)
   ├── Two-Stage Skill Resolver + PDF Resume Parser (pypdf)
   ├── Hybrid RecSys + Explainable Skill Gaps + What-If Simulator
   └── Kahn's DAG Scheduler + Resilient Multi-LLM RAG (Gemini -> OpenAI -> Fallback)
```

### Hybrid Recommendation Scoring

For user profile $u$ and candidate role $r$:

$$\text{Score}(u, r) = \text{clamp}\Big(100 \cdot \big(0.50 \cdot S_{\text{skill}} + 0.32 \cdot S_{\text{semantic}} + 0.18 \cdot S_{\text{alignment}}\big) + \Delta_{\text{feedback}},\; 0,\; 100\Big)$$

* **$S_{\text{skill}}$**: Weighted overlap across `core_skills` (78%) and `nice_to_have_skills` (22%) scaled by user proficiency (`beginner=0.45`, `intermediate=0.78`, `advanced=1.0`).
* **$S_{\text{semantic}}$**: Calibrated cosine similarity between normalized profile and role embeddings (`all-MiniLM-L6-v2`).
* **$S_{\text{alignment}}$**: Experience band fit, work-style preference, and gap-closure feasibility within `target_timeline_weeks`.
* **$\Delta_{\text{feedback}}$**: Re-ranking adjustment (`+3.5` saved, `-20.0` dismissed).

---

## Offline RecSys Evaluation Benchmark

Evaluated across **25 labeled developer & career-switcher personas** using `sentence-transformers/all-MiniLM-L6-v2` (`ml-service/eval/evaluate_recsys.py`):

| Engine | Precision@3 | Recall@5 | NDCG@5 | MRR |
| :--- | :---: | :---: | :---: | :---: |
| Keyword + TF-IDF Baseline | 0.667 | 0.867 | 0.926 | 0.980 |
| Dense Semantic Only (`all-MiniLM-L6-v2`) | 0.760 | 0.920 | 0.949 | 1.000 |
| **Hybrid Engine (Skill Coverage + Semantic + Alignment)** | **0.800** | **0.973** | **0.977** | **1.000** |

* **+20.0% relative lift in Precision@3**, **+12.2% in Recall@5**, and **+5.6% in NDCG@5** over the keyword baseline.

---

## Tech Stack & Project Structure

```text
├── docker-compose.yml            # 4-container stack (mongo, ml-service, server, client)
├── ml-service/                   # Python 3.12 (uv) + FastAPI + PyTorch CPU + sentence-transformers
│   ├── app/
│   │   ├── main.py               # FastAPI routes, lifespan preloader, X-Request-Id middleware
│   │   ├── core/config.py        # Pydantic settings (.env)
│   │   ├── schemas/models.py     # Strict Pydantic v2 contracts
│   │   └── services/             # taxonomy, embeddings, skill_matcher, resume_parser,
│   │                             # recommender, llm_provider, roadmap_generator
│   ├── data/                     # skills_graph.json (65 skills) & roles_taxonomy.json (30 roles)
│   ├── eval/                     # 25-persona benchmark suite & evaluator
│   └── tests/                    # pytest unit, failover, & API contract tests
├── server/                       # Node.js + Express + TypeScript + Mongoose + Zod + JWT
│   ├── src/
│   │   ├── config/               # env.ts, db.ts (MongoDB URI or USE_INMEMORY_MONGO=true)
│   │   ├── middleware/           # JWT auth, Zod validation, requestId, errorHandler
│   │   ├── models/               # User, CareerProfile, Roadmap
│   │   ├── routes/               # auth, profile, recommendations, roadmaps
│   │   └── services/mlClient.ts  # Resilient HTTP proxy with retries & multipart PDF streaming
│   └── tests/                    # Vitest + Supertest + mongodb-memory-server integration tests
└── client/                       # React 19 + TypeScript + Vite + Tailwind CSS v4
    └── src/
        ├── api/client.ts         # Axios client with JWT interceptor
        ├── context/AuthContext.tsx
        ├── components/           # Layout, RoleCard (Show / Re-generate / Generate Roadmap)
        └── pages/                # LandingAuth, Onboarding, Dashboard, RoleAnalysis,
                                  # MyRoadmaps, RoadmapStudio (React Flow DAG)
```

---

## API Overview

| Service | Endpoint | Purpose |
| :--- | :--- | :--- |
| **Express (`:5000`)** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | JWT authentication |
| **Express (`:5000`)** | `GET/PUT /api/profile`, `POST /api/profile/resume`, `POST /api/profile/feedback` | Profile CRUD, PDF resume parsing, Save/Dismiss |
| **Express (`:5000`)** | `GET /api/recommendations`, `POST /api/recommendations/simulate` | Ranked roles & live What-If skill simulation |
| **Express (`:5000`)** | `GET/POST /api/roadmaps`, `PATCH /api/roadmaps/:id/nodes/:nodeId`, `DELETE /api/roadmaps/:id` | Persist roadmaps, toggle DAG milestones & sync skills |
| **FastAPI (`:8000`)** | `GET /health`, `GET /docs`, `GET /api/v1/taxonomy/{skills,roles}` | Liveness, OpenAPI UI, canonical ontology |
| **FastAPI (`:8000`)** | `POST /api/v1/resume/parse`, `/recommend`, `/simulate`, `/roadmap/generate` | ML inference & grounded RAG synthesis |

---

## Local Development Setup

### 1. Python ML & Gen AI Microservice (`ml-service/`)
```powershell
cd ml-service
copy .env.example .env
# Optional: configure GEMINI_API_KEY and/or OPENAI_API_KEY (and LLM_PROVIDER=gemini|openai|fallback)
uv sync
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
*(FastAPI interactive Swagger docs available at `http://localhost:8000/docs`.)*

### 2. Express + MongoDB Backend (`server/`)
```powershell
cd server
copy .env.example .env
# Set MONGO_URI to your local MongoDB or MongoDB Atlas cluster,
# OR set USE_INMEMORY_MONGO=true for zero-setup in-memory dev storage.
npm install
npm run dev
```

### 3. React Frontend (`client/`)
```powershell
cd client
npm install
npm run dev
```
Open `http://localhost:5173`.

### Docker Compose (All 4 Services)
```powershell
docker compose up --build
```
Access the app at `http://localhost:8080`.

---

## Testing & Verification

```powershell
# 1. Python ML unit, LLM failover, & FastAPI contract tests (12 tests)
cd ml-service
.\.venv\Scripts\python.exe -m pytest -v

# 2. Offline 25-persona RecSys benchmark (Precision@3, Recall@5, NDCG@5, MRR)
$env:PYTHONPATH="."; .\.venv\Scripts\python.exe eval\evaluate_recsys.py

# 3. Express + MongoDB integration tests & TypeScript build
cd ../server
npm test
npm run build

# 4. React TypeScript check & production bundle
cd ../client
npm run build
```
