"""
Offline RecSys Evaluation Harness
Benchmarks three recommendation strategies across 25 labeled developer & career-switcher personas:
  1. Keyword Baseline (Exact canonical overlap + TF-IDF cosine)
  2. Dense Semantic Only (sentence-transformers all-MiniLM-L6-v2)
  3. Hybrid Engine (Weighted Skill Coverage + Dense Semantic + Profile Alignment)

Metrics reported: Precision@3, Recall@5, NDCG@5, MRR.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import numpy as np

from app.core.config import settings
from app.schemas.models import UserProfileInput
from app.services.embeddings import EmbeddingService, PureNumpyTfidfSVD
from app.services.recommender import HybridCareerRecommender
from app.services.skill_matcher import SkillMatcher, normalize_token
from app.services.taxonomy import TaxonomyStore

EVAL_DIR = Path(__file__).resolve().parent


def precision_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    top_k = ranked[:k]
    return sum(1 for r in top_k if r in relevant) / k


def recall_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    top_k = ranked[:k]
    return sum(1 for r in top_k if r in relevant) / len(relevant)


def ndcg_at_k(ranked: list[str], relevant_ordered: list[str], k: int) -> float:
    # Graded relevance: primary target = 3, secondary = 2, tertiary = 1
    rel_map = {
        rid: max(1, 3 - idx) for idx, rid in enumerate(relevant_ordered)
    }
    dcg = 0.0
    for i, rid in enumerate(ranked[:k]):
        gain = rel_map.get(rid, 0)
        if gain > 0:
            dcg += (2**gain - 1) / math.log2(i + 2)

    ideal_gains = sorted(rel_map.values(), reverse=True)[:k]
    idcg = sum((2**g - 1) / math.log2(i + 2) for i, g in enumerate(ideal_gains))
    return (dcg / idcg) if idcg > 0 else 0.0


def reciprocal_rank(ranked: list[str], relevant: set[str]) -> float:
    for idx, rid in enumerate(ranked):
        if rid in relevant:
            return 1.0 / (idx + 1)
    return 0.0


def evaluate_system(
    name: str,
    personas: list[dict],
    rank_fn,
) -> dict[str, float]:
    p3, r5, n5, mrr = [], [], [], []
    for item in personas:
        profile = UserProfileInput.model_validate(item["profile"])
        relevant_ordered = item["relevant_roles"]
        relevant_set = set(relevant_ordered)
        ranked_ids = rank_fn(profile)
        p3.append(precision_at_k(ranked_ids, relevant_set, 3))
        r5.append(recall_at_k(ranked_ids, relevant_set, 5))
        n5.append(ndcg_at_k(ranked_ids, relevant_ordered, 5))
        mrr.append(reciprocal_rank(ranked_ids, relevant_set))
    return {
        "name": name,
        "P@3": float(np.mean(p3)),
        "R@5": float(np.mean(r5)),
        "NDCG@5": float(np.mean(n5)),
        "MRR": float(np.mean(mrr)),
    }


def run_benchmark() -> list[dict]:
    taxonomy = TaxonomyStore(settings.data_dir)
    embeddings = EmbeddingService(
        backend=settings.embedding_backend,
        model_name=settings.embedding_model,
        gemini_api_key=settings.gemini_api_key,
        gemini_embedding_model=settings.gemini_embedding_model,
        gemini_embedding_dims=settings.gemini_embedding_dims,
        cache_dir=settings.data_dir,
    )
    roles = taxonomy.list_roles()
    role_texts = [taxonomy.role_document_text(r) for r in roles]
    skill_texts = [taxonomy.skill_document_text(s) for s in taxonomy.skills.values()]
    embeddings.fit_corpus(role_texts + skill_texts)

    matcher = SkillMatcher(taxonomy, embeddings)
    hybrid = HybridCareerRecommender(
        taxonomy,
        embeddings,
        matcher,
        semantic_norm_mode=settings.semantic_norm_mode,
    )

    # Baseline 1: Naive exact-name overlap + TF-IDF
    tfidf = PureNumpyTfidfSVD(max_features=3000, n_components=32).fit(role_texts)
    role_tfidf = tfidf.transform_tfidf(role_texts)

    def rank_keyword_baseline(profile: UserProfileInput) -> list[str]:
        raw_names = {normalize_token(s.name) for s in profile.skills}
        query_text = f"{profile.summary} {' '.join(profile.interests)} {' '.join(s.name for s in profile.skills)}"
        q_vec = tfidf.transform_tfidf([query_text])[0]
        sims = role_tfidf @ q_vec
        scored = []
        for idx, role in enumerate(roles):
            exact_hits = sum(
                1
                for sid in role.core_skills
                if normalize_token(taxonomy.skills[sid].name) in raw_names
            )
            overlap = exact_hits / max(1, len(role.core_skills))
            scored.append((0.5 * overlap + 0.5 * float(sims[idx]), role.id))
        scored.sort(key=lambda x: -x[0])
        return [rid for _, rid in scored]

    # Baseline 2: Dense semantic similarity only
    def rank_semantic_only(profile: UserProfileInput) -> list[str]:
        resolved_map, _ = matcher.resolve_user_skills(profile.skills)
        text = hybrid._profile_to_text(profile, resolved_map)
        vec = embeddings.encode([text])[0]
        sims = embeddings.cosine_similarity(vec, hybrid.role_matrix)
        order = np.argsort(-sims)
        return [roles[int(i)].id for i in order]

    # System 3: Full Hybrid Engine
    def rank_hybrid(profile: UserProfileInput) -> list[str]:
        resp = hybrid.recommend(profile)
        return [r.role_id for r in resp.recommendations]

    personas = json.loads((EVAL_DIR / "benchmark_personas.json").read_text(encoding="utf-8"))

    results = [
        evaluate_system("Keyword + TF-IDF Baseline", personas, rank_keyword_baseline),
        evaluate_system("Dense Semantic Only", personas, rank_semantic_only),
        evaluate_system("Hybrid Engine (Ours)", personas, rank_hybrid),
    ]

    print(f"\nOffline RecSys Evaluation ({len(personas)} Personas | Backend: {embeddings.active_backend})\n")
    print("| Engine | Precision@3 | Recall@5 | NDCG@5 | MRR |")
    print("| :--- | :---: | :---: | :---: | :---: |")
    for r in results:
        print(
            f"| {r['name']} | {r['P@3']:.3f} | {r['R@5']:.3f} | {r['NDCG@5']:.3f} | {r['MRR']:.3f} |"
        )

    base = results[0]
    ours = results[2]
    ndcg_lift = ((ours["NDCG@5"] - base["NDCG@5"]) / max(1e-6, base["NDCG@5"])) * 100.0
    print(f"\nNDCG@5 relative improvement over keyword baseline: +{ndcg_lift:.1f}%\n")
    return results


if __name__ == "__main__":
    run_benchmark()
