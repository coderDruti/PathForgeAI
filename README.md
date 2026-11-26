# PathForge AI — Career Path Recommender & Grounded RAG Roadmap Studio

An end-to-end **SDE + Gen AI** full-stack platform combining a **MERN (MongoDB, Express, React, Node.js)** application layer with a dedicated **Python FastAPI ML & Gen AI microservice**, engineered for both local development and zero-cost cloud deployment (**Vercel + Render Free + MongoDB Atlas M0**).

---

## Key Capabilities

* **Hybrid Career Recommendation Engine (`ml-service`)**
  * Combines **dense semantic embeddings**, **proficiency-weighted canonical skill coverage**, **career-stage & timeline alignment**, and **Save / Dismiss user feedback re-ranking**.
  * Supports **3 pluggable embedding backends** via `EMBEDDING_BACKEND`:
    * `gemini` — Google Gemini Embedding API (`gemini-embedding-001`, 768 dims, batched 100/call) with **SHA-256 content-fingerprinted `.npz` static taxonomy caching** (`0` API calls at startup, ~100–130 MB RAM for Render Free).
    * `sentence_transformers` — Local `all-MiniLM-L6-v2` on CPU PyTorch.
    * `tfidf_svd` — Dependency-free pure-NumPy TF-IDF + SVD offline fallback.
  * Handles cross-model embedding anisotropy via a runtime-configurable **`SEMANTIC_NORM_MODE`** env var (`zscore_sigmoid` default, `minmax`, or `linear`) — parameter-free, model-agnostic, and confidence-capped on zero vectors.
  * Produces transparent score breakdowns (`Skill Match`, `Semantic Fit`, `Alignment`) and readiness tiers (`Best Fit Now`, `Adjacent Pivot`, `Stretch Goal`) across **30 curated roles** and **65 prerequisite-linked canonical skills**.
* **Two-Stage Skill Resolver & PDF Resume Parser**
  * Drag-and-drop PDF resume upload extracts canonical skills, inferred proficiency cues, experience years, and summary snippets via `pypdf`.
  * Resolves synonyms/aliases (`ReactJS`, `k8s`, `RAG`) deterministically first, then falls back to semantic cosine matching (`>= 0.72`).
* **Skill Gap Analyzer & Interactive "What-If" Skill Simulator**
  * Visualizes category-level readiness with Recharts Radar Charts (`User Coverage` vs. `Role Requirement`).
  * Toggle hypothetical missing skills to compute live match score deltas, overall rank jumps, weeks saved, and cross-role top movers.
* **Grounded RAG Career Roadmap Studio (React Flow DAG)**
  * Deterministically builds an acyclic topological prerequisite **DAG** (Kahn's algorithm) scheduled across the user's weekly study hours.
  * Enriches milestones, tailored portfolio capstone projects (with copyable resume bullet templates), and targeted interview questions via a resilient **multi-provider LLM adapter**:
    * **Primary:** Google Gemini (`google-genai`, default `gemini-4-hydrogen`) with automatic transient `503`/`429` retry & backoff.
    * **Automatic Failover:** OpenAI (`openai` structured outputs, default `gpt-6-luna`, compatible with default-temperature reasoning & newer model families).
    * **Zero-Key Fallback:** Deterministic grounded graph synthesis when API keys are omitted or cloud providers are unavailable.
  * Strictly validates LLM-returned `skill_id` references against the deterministic DAG to prevent hallucinated prerequisites.
* **Persistent Progress & Smart Roadmap Controls**
  * Completing a node in the DAG Studio dynamically unlocks dependent nodes and syncs the mastered skill back into the user's MongoDB `CareerProfile`.
  * Both the **Recommendations Dashboard** and **Role Analysis** views check MongoDB for pre-generated roadmaps—rendering **Show Roadmap** (direct jump to DAG Studio with zero redundant LLM calls) + **Re-generate Roadmap** for existing tracks, and **Generate Roadmap** for new roles.

---

## Architecture

```text
React 19 + TypeScript + Tailwind + React Flow + Recharts (Vercel / :5173)
        │  REST + JWT Auth
        ▼
Node.js + Express + TypeScript + Zod Gateway (Render / :5000) ◄──► MongoDB (Atlas M0 / Local / In-Memory)
        │  Internal HTTP + X-Request-Id + Retries (45s–60s timeout)
        ▼
Python 3.12 + FastAPI ML & Gen AI Microservice (Render / :8000)
   ├── Pluggable Embeddings: Gemini API (+ SHA-256 .npz cache) | Local MiniLM | Pure-NumPy TF-IDF/SVD
   ├── Two-Stage Skill Resolver + PDF Resume Parser (pypdf)
   ├── Hybrid RecSys (SEMANTIC_NORM_MODE) + Explainable Skill Gaps + What-If Simulator
   └── Kahn's DAG Scheduler + Resilient Multi-LLM RAG (Gemini -> OpenAI -> Deterministic Fallback)
```

### Hybrid Recommendation Scoring

For user profile $u$ and candidate role $r$:

$$\text{Score}(u, r) = \text{clamp}\Big(100 \cdot \big(0.50 \cdot S_{\text{skill}} + 0.32 \cdot S_{\text{semantic}} + 0.18 \cdot S_{\text{alignment}}\big) + \Delta_{\text{feedback}},\; 0,\; 100\Big)$$

* **$S_{\text{skill}}$**: Weighted overlap across `core_skills` (78%) and `nice_to_have_skills` (22%) scaled by user proficiency (`beginner=0.45`, `intermediate=0.78`, `advanced=1.0`).
* **$S_{\text{semantic}}$**: Normalized cosine similarity across candidate roles using `SEMANTIC_NORM_MODE` (default `zscore_sigmoid`: confidence-capped Z-score sigmoid).
* **$S_{\text{alignment}}$**: Experience band fit, work-style preference, and gap-closure feasibility within `target_timeline_weeks`.
* **$\Delta_{\text{feedback}}$**: Re-ranking adjustment (`+3.5` saved, `-20.0` dismissed).

---

## Offline RecSys Evaluation Benchmarks

Evaluated across **25 labeled developer & career-switcher personas** (`ml-service/eval/evaluate_recsys.py`):

### 1. Cloud Low-RAM Backend (`gemini-embedding-001` + `.npz` cache + `zscore_sigmoid`)

| Engine | Precision@3 | Recall@5 | NDCG@5 | MRR |
| :--- | :---: | :---: | :---: | :---: |
| Keyword + TF-IDF Baseline | 0.667 | 0.867 | 0.926 | 0.980 |
| Dense Semantic Only (`gemini-embedding-001`) | 0.800 | 1.000 | 0.983 | 1.000 |
| **Hybrid Engine (`zscore_sigmoid`, default)** | **0.773** | **0.987** | **0.976** | **1.000** |

* **+15.9% relative lift in Precision@3**, **+13.8% in Recall@5**, and **+5.4% in NDCG@5** over the keyword baseline, with **0 startup API calls** via the 266 KB `.npz` cache.

### 2. Local Transformer Backend (`sentence-transformers/all-MiniLM-L6-v2`)

| Engine | Precision@3 | Recall@5 | NDCG@5 | MRR |
| :--- | :---: | :---: | :---: | :---: |
| Keyword + TF-IDF Baseline | 0.667 | 0.867 | 0.926 | 0.980 |
| Dense Semantic Only (`all-MiniLM-L6-v2`) | 0.760 | 0.920 | 0.949 | 1.000 |
| **Hybrid Engine** | **0.800** | **0.973** | **0.977** | **1.000** |

---

## Project Structure

```text
├── docker-compose.yml                  # 4-container local stack (mongo, ml-service, server, client)
├── ml-service/                         # Python 3.12 (uv) + FastAPI ML & Gen AI service
│   ├── requirements-render.txt         # Lightweight Render Free dependencies (no PyTorch, ~120 MB RAM)
│   ├── pyproject.toml                  # Full local dev dependencies (includes CPU PyTorch + pytest)
│   ├── app/
│   │   ├── main.py                     # FastAPI routes, lifespan preloader, X-Request-Id middleware
│   │   ├── core/config.py              # Pydantic settings (.env)
│   │   ├── schemas/models.py           # Strict Pydantic v2 contracts
│   │   └── services/                   # taxonomy, embeddings (+ .npz cache), skill_matcher,
│   │                                   # resume_parser, recommender, llm_provider, roadmap_generator
│   ├── data/
│   │   ├── skills_graph.json           # 65 canonical skills with prerequisite DAG & resources
│   │   ├── roles_taxonomy.json         # 30 curated roles with weighted skills & salary bands
│   │   ├── gemini_cache_skills.npz     # Pre-computed Gemini embeddings for skills (182 KB)
│   │   └── gemini_cache_roles.npz      # Pre-computed Gemini embeddings for roles (84 KB)
│   ├── eval/                           # 25-persona benchmark suite & offline evaluator
│   └── tests/                          # 15 pytest unit, cache, failover, & API contract tests
├── server/                             # Node.js + Express + TypeScript + Mongoose + Zod + JWT
│   ├── src/
│   │   ├── config/                     # env.ts, db.ts (MongoDB Atlas/local or USE_INMEMORY_MONGO=true)
│   │   ├── middleware/                 # JWT auth, Zod validation, requestId, errorHandler
│   │   ├── models/                     # User, CareerProfile, Roadmap
│   │   ├── routes/                     # auth, profile, recommendations, roadmaps
│   │   └── services/mlClient.ts        # Resilient HTTP proxy with retries & multipart PDF streaming
│   └── tests/                          # Vitest + Supertest + mongodb-memory-server integration tests
└── client/                             # React 19 + TypeScript + Vite + Tailwind CSS v4
    ├── vercel.json                     # SPA client-side routing rewrite for Vercel
    └── src/
        ├── api/client.ts               # Axios client with JWT interceptor
        ├── context/AuthContext.tsx
        ├── components/                 # Layout, RoleCard (Show / Re-generate / Generate Roadmap)
        └── pages/                      # LandingAuth, Onboarding, Dashboard, RoleAnalysis,
                                        # MyRoadmaps, RoadmapStudio (React Flow DAG)
```

---

## API Overview

| Service | Endpoint | Purpose |
| :--- | :--- | :--- |
| **Express (`:5000`)** | `GET /api/health` | Gateway & downstream ML service health status |
| **Express (`:5000`)** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | JWT authentication |
| **Express (`:5000`)** | `GET/PUT /api/profile`, `POST /api/profile/resume`, `POST /api/profile/feedback` | Profile CRUD, PDF resume parsing, Save/Dismiss |
| **Express (`:5000`)** | `GET /api/recommendations`, `POST /api/recommendations/simulate` | Ranked roles & live What-If skill simulation |
| **Express (`:5000`)** | `GET/POST /api/roadmaps`, `PATCH /api/roadmaps/:id/nodes/:nodeId`, `DELETE /api/roadmaps/:id` | Persist roadmaps, toggle DAG milestones & sync skills |
| **FastAPI (`:8000`)** | `GET /health`, `GET /docs`, `GET /api/v1/taxonomy/{skills,roles}` | Liveness (backend + norm mode), OpenAPI UI, canonical ontology |
| **FastAPI (`:8000`)** | `POST /api/v1/resume/parse`, `/recommend`, `/simulate`, `/roadmap/generate` | ML inference & grounded RAG synthesis |

---

## Local Development Setup

### 1. Python ML & Gen AI Microservice (`ml-service/`)
```powershell
cd ml-service
copy .env.example .env
# Optional: set EMBEDDING_BACKEND=gemini|sentence_transformers|tfidf_svd and GEMINI_API_KEY / OPENAI_API_KEY
uv sync
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
*(Interactive Swagger docs at `http://localhost:8000/docs`.)*

### 2. Express + MongoDB Backend (`server/`)
```powershell
cd server
copy .env.example .env
# Point MONGO_URI to MongoDB Atlas / local MongoDB, OR set USE_INMEMORY_MONGO=true for zero-setup dev
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

### Docker Compose (All 4 Services Locally)
```powershell
docker compose up --build
```
Access the app at `http://localhost:8080`.

---

## Cloud Deployment (100% Free Stack: Vercel + Render + MongoDB Atlas)

1. **MongoDB Atlas (M0 Free):** Create an M0 cluster, add a DB user, allow network access `0.0.0.0/0`, and copy the `mongodb+srv://...` URI.
2. **Render — `ml-service/` (Python 3, Free):**
   * **Root Directory:** `ml-service`
   * **Build Command:** `pip install -r requirements-render.txt`
   * **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * **Env Vars:** `APP_ENV=production`, `PYTHON_VERSION=3.12.0`, `EMBEDDING_BACKEND=gemini`, `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`, `GEMINI_EMBEDDING_DIMS=768`, `SEMANTIC_NORM_MODE=zscore_sigmoid`, `LLM_PROVIDER=openai` *(or `gemini`)*, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-4-hydrogen`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna`, `CORS_ORIGINS=<render-server-url>,<vercel-url>`.
3. **Render — `server/` (Node, Free):**
   * **Root Directory:** `server`
   * **Build Command:** `npm install --include=dev && npm run build`
   * **Start Command:** `npm start`
   * **Env Vars:** `NODE_ENV=production`, `NODE_VERSION=22`, `MONGO_URI`, `USE_INMEMORY_MONGO=false`, `JWT_SECRET` (random 48-byte hex), `JWT_EXPIRES_IN=7d`, `ML_SERVICE_URL=https://<ml-service>.onrender.com`, `ML_TIMEOUT_MS=60000`, `CLIENT_ORIGIN=https://<app>.vercel.app`.
4. **Vercel — `client/` (Vite, Free):**
   * **Root Directory:** `client` (`client/vercel.json` handles SPA rewrites automatically)
   * **Env Var:** `VITE_API_URL=https://<server>.onrender.com/api`

---

## Testing & Verification

```powershell
# 1. Python ML unit, cache, normalization, LLM failover, & FastAPI contract tests (15 tests)
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
