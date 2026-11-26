from collections import defaultdict
import math
import numpy as np
from app.schemas.models import (
    CategoryCoverage,
    Proficiency,
    ReadinessTier,
    RecommendResponse,
    RoleDefinition,
    RoleRecommendation,
    ScoreBreakdown,
    SimulateRequest,
    SimulateResponse,
    SimulatedRoleDelta,
    SkillMatchDetail,
    UserProfileInput,
    UserSkillInput,
)
from app.services.embeddings import EmbeddingService
from app.services.skill_matcher import SkillMatcher
from app.services.taxonomy import TaxonomyStore

PROFICIENCY_WEIGHT: dict[Proficiency, float] = {
    "beginner": 0.45,
    "intermediate": 0.78,
    "advanced": 1.0,
}


class HybridCareerRecommender:
    """
    Hybrid Career Recommendation Engine combining:
    1. Weighted canonical skill coverage (core + nice-to-have, proficiency-aware)
    2. Dense semantic similarity (sentence-transformers all-MiniLM-L6-v2)
    3. Profile alignment (experience level, work style, timeline feasibility)
    4. User feedback adjustments (saved / dismissed roles)
    """

    def __init__(
        self,
        taxonomy: TaxonomyStore,
        embeddings: EmbeddingService,
        matcher: SkillMatcher,
    ):
        self.taxonomy = taxonomy
        self.embeddings = embeddings
        self.matcher = matcher
        self.role_list: list[RoleDefinition] = taxonomy.list_roles()
        self.role_matrix: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self._build_role_index()

    def _build_role_index(self) -> None:
        role_texts = [self.taxonomy.role_document_text(r) for r in self.role_list]
        skill_texts = [self.taxonomy.skill_document_text(s) for s in self.taxonomy.skills.values()]
        # Fit fallback SVD on the combined corpus if needed
        self.embeddings.fit_corpus(role_texts + skill_texts)
        self.role_matrix = self.embeddings.encode(role_texts)

    def _profile_to_text(
        self, profile: UserProfileInput, resolved_map: dict[str, Proficiency]
    ) -> str:
        skill_names = [
            f"{self.taxonomy.skills[sid].name} ({prof})"
            for sid, prof in resolved_map.items()
            if sid in self.taxonomy.skills
        ]
        # Include any unresolved raw skill names too so semantic search still captures them
        unresolved_names = [
            s.name for s in profile.skills if not s.skill_id or s.skill_id not in resolved_map
        ]
        parts = []
        if profile.summary.strip():
            parts.append(profile.summary.strip())
        if profile.interests:
            parts.append(f"Career interests: {', '.join(profile.interests)}.")
        if skill_names or unresolved_names:
            parts.append(f"Technical skills: {', '.join(skill_names + unresolved_names)}.")
        if profile.work_style != "any":
            parts.append(f"Preferred work focus: {profile.work_style}.")
        return " ".join(parts) or "Software engineering and technology career growth."

    def _score_role(
        self,
        role: RoleDefinition,
        profile: UserProfileInput,
        resolved_map: dict[str, Proficiency],
        raw_cosine: float,
    ) -> RoleRecommendation:
        matched: list[SkillMatchDetail] = []
        partial: list[SkillMatchDetail] = []
        missing_core: list[SkillMatchDetail] = []
        missing_nice: list[SkillMatchDetail] = []

        core_weight_total = sum(role.core_skills.values()) or 1.0
        core_earned = 0.0
        remaining_core_hours = 0

        cat_user: dict[str, float] = defaultdict(float)
        cat_req: dict[str, float] = defaultdict(float)

        for sid, weight in sorted(role.core_skills.items(), key=lambda kv: -kv[1]):
            skill = self.taxonomy.skills[sid]
            cat_req[skill.category] += weight
            if sid in resolved_map:
                prof = resolved_map[sid]
                mult = PROFICIENCY_WEIGHT[prof]
                core_earned += weight * mult
                cat_user[skill.category] += weight * mult
                if prof == "beginner":
                    hrs = max(6, round(skill.estimated_hours * 0.5))
                    remaining_core_hours += hrs
                    partial.append(
                        SkillMatchDetail(
                            skill_id=sid,
                            name=skill.name,
                            category=skill.category,
                            weight=weight,
                            user_proficiency=prof,
                            status="partial",
                            estimated_hours=hrs,
                        )
                    )
                else:
                    matched.append(
                        SkillMatchDetail(
                            skill_id=sid,
                            name=skill.name,
                            category=skill.category,
                            weight=weight,
                            user_proficiency=prof,
                            status="matched",
                            estimated_hours=0,
                        )
                    )
            else:
                remaining_core_hours += skill.estimated_hours
                missing_core.append(
                    SkillMatchDetail(
                        skill_id=sid,
                        name=skill.name,
                        category=skill.category,
                        weight=weight,
                        user_proficiency=None,
                        status="missing_core",
                        estimated_hours=skill.estimated_hours,
                    )
                )

        nice_weight_total = sum(role.nice_to_have_skills.values())
        nice_earned = 0.0
        for sid, weight in sorted(role.nice_to_have_skills.items(), key=lambda kv: -kv[1]):
            skill = self.taxonomy.skills[sid]
            cat_req[skill.category] += weight * 0.5
            if sid in resolved_map:
                prof = resolved_map[sid]
                mult = PROFICIENCY_WEIGHT[prof]
                nice_earned += weight * mult
                cat_user[skill.category] += weight * 0.5 * mult
                matched.append(
                    SkillMatchDetail(
                        skill_id=sid,
                        name=skill.name,
                        category=skill.category,
                        weight=weight,
                        user_proficiency=prof,
                        status="matched",
                        estimated_hours=0,
                    )
                )
            else:
                missing_nice.append(
                    SkillMatchDetail(
                        skill_id=sid,
                        name=skill.name,
                        category=skill.category,
                        weight=weight,
                        user_proficiency=None,
                        status="missing_nice",
                        estimated_hours=skill.estimated_hours,
                    )
                )

        core_ratio = core_earned / core_weight_total
        nice_ratio = (nice_earned / nice_weight_total) if nice_weight_total > 0 else core_ratio
        skill_coverage = 0.78 * core_ratio + 0.22 * nice_ratio

        # Calibrate cosine similarity to [0, 1]
        semantic_score = min(1.0, max(0.0, (raw_cosine - 0.08) / 0.62))

        # Experience alignment
        exp = profile.experience_years
        if role.level == "entry":
            exp_score = 1.0 if exp <= 3.0 else max(0.6, 1.0 - (exp - 3.0) * 0.06)
        elif role.level == "mid":
            exp_score = 1.0 if 1.0 <= exp <= 7.0 else (0.78 if exp < 1.0 else max(0.7, 1.0 - (exp - 7.0) * 0.05))
        else:  # senior
            exp_score = 1.0 if exp >= 4.0 else max(0.45, 0.55 + exp * 0.11)

        # Work style alignment
        if profile.work_style == "any":
            style_score = 0.85
        elif profile.work_style == role.work_style:
            style_score = 1.0
        else:
            style_score = 0.55

        # Timeline feasibility (including prerequisite hours not yet covered)
        missing_core_ids = {m.skill_id for m in missing_core}
        prereqs = self.taxonomy.get_transitive_prerequisites(missing_core_ids)
        extra_prereq_hours = sum(
            self.taxonomy.skills[p].estimated_hours
            for p in prereqs
            if p not in resolved_map and p not in missing_core_ids and p in self.taxonomy.skills
        )
        total_hours_needed = remaining_core_hours + extra_prereq_hours
        estimated_weeks = (
            max(1, math.ceil(total_hours_needed / max(1, profile.weekly_hours)))
            if total_hours_needed > 0
            else 0
        )

        if estimated_weeks <= profile.target_timeline_weeks:
            timeline_score = 1.0
        else:
            overflow = (estimated_weeks - profile.target_timeline_weeks) / max(1, profile.target_timeline_weeks)
            timeline_score = max(0.35, 1.0 - overflow * 0.45)

        alignment_score = 0.40 * exp_score + 0.35 * style_score + 0.25 * timeline_score

        feedback_delta = 0.0
        if role.id in profile.saved_role_ids:
            feedback_delta += 3.5
        if role.id in profile.dismissed_role_ids:
            feedback_delta -= 20.0

        raw_composite = (
            100.0 * (0.50 * skill_coverage + 0.32 * semantic_score + 0.18 * alignment_score)
            + feedback_delta
        )
        match_score = round(min(100.0, max(0.0, raw_composite)), 1)

        if match_score >= 70.0:
            tier: ReadinessTier = "best_fit"
        elif match_score >= 46.0:
            tier = "adjacent_pivot"
        else:
            tier = "stretch_goal"

        category_coverage = [
            CategoryCoverage(
                category=cat,
                user_score=round(min(100.0, (cat_user[cat] / req) * 100.0), 1),
                required_score=100.0,
            )
            for cat, req in sorted(cat_req.items())
            if req > 0
        ]

        explanation = self._build_explanation(
            role, match_score, matched, partial, missing_core, estimated_weeks
        )

        return RoleRecommendation(
            role_id=role.id,
            title=role.title,
            domain=role.domain,
            level=role.level,
            work_style=role.work_style,
            salary_band_usd=role.salary_band_usd,
            demand_trend=role.demand_trend,
            description=role.description,
            match_score=match_score,
            readiness_tier=tier,
            score_breakdown=ScoreBreakdown(
                skill_coverage=round(skill_coverage * 100.0, 1),
                semantic_similarity=round(semantic_score * 100.0, 1),
                profile_alignment=round(alignment_score * 100.0, 1),
                feedback_delta=round(feedback_delta, 1),
            ),
            matched_skills=matched,
            partial_skills=partial,
            missing_core_skills=missing_core,
            missing_nice_skills=missing_nice,
            category_coverage=category_coverage,
            estimated_weeks_to_ready=estimated_weeks,
            explanation=explanation,
        )

    @staticmethod
    def _build_explanation(
        role: RoleDefinition,
        score: float,
        matched: list[SkillMatchDetail],
        partial: list[SkillMatchDetail],
        missing_core: list[SkillMatchDetail],
        weeks: int,
    ) -> str:
        strengths = [s.name for s in matched[:3]]
        gaps = [s.name for s in (missing_core + partial)[:3]]
        strength_txt = (
            f"Strong foundation in {', '.join(strengths)}."
            if strengths
            else "Semantic interest alignment with this track."
        )
        if not gaps:
            return f"{score:.0f}% match — {strength_txt} You already cover every core skill for {role.title}."
        return (
            f"{score:.0f}% match — {strength_txt} "
            f"Focus next on {', '.join(gaps)} (~{weeks} wks at your pace)."
        )

    def recommend(self, profile: UserProfileInput, top_k: int | None = None) -> RecommendResponse:
        resolved_map, resolved_list = self.matcher.resolve_user_skills(profile.skills)
        profile_text = self._profile_to_text(profile, resolved_map)
        profile_vec = self.embeddings.encode([profile_text])[0]
        cos_scores = self.embeddings.cosine_similarity(profile_vec, self.role_matrix)

        recs = [
            self._score_role(role, profile, resolved_map, float(cos_scores[idx]))
            for idx, role in enumerate(self.role_list)
        ]
        recs.sort(key=lambda r: (-r.match_score, r.estimated_weeks_to_ready, r.title))

        if top_k is not None:
            recs = recs[:top_k]

        return RecommendResponse(
            resolved_skills=resolved_list,
            recommendations=recs,
            embedding_backend=self.embeddings.active_backend,
        )

    def simulate_skills(self, req: SimulateRequest) -> SimulateResponse:
        baseline = self.recommend(req.profile)
        before_by_id = {r.role_id: (idx + 1, r) for idx, r in enumerate(baseline.recommendations)}

        merged_profile = req.profile.model_copy(
            update={"skills": [*req.profile.skills, *req.hypothetical_skills]}
        )
        updated = self.recommend(merged_profile)
        _, resolved_added = self.matcher.resolve_user_skills(req.hypothetical_skills)

        deltas: list[SimulatedRoleDelta] = []
        focus_delta: SimulatedRoleDelta | None = None

        for after_idx, rec in enumerate(updated.recommendations):
            before_rank, before_rec = before_by_id[rec.role_id]
            after_rank = after_idx + 1
            delta = SimulatedRoleDelta(
                role_id=rec.role_id,
                title=rec.title,
                domain=rec.domain,
                before_score=before_rec.match_score,
                after_score=rec.match_score,
                score_delta=round(rec.match_score - before_rec.match_score, 1),
                before_rank=before_rank,
                after_rank=after_rank,
                rank_delta=before_rank - after_rank,
                before_tier=before_rec.readiness_tier,
                after_tier=rec.readiness_tier,
                before_weeks=before_rec.estimated_weeks_to_ready,
                after_weeks=rec.estimated_weeks_to_ready,
            )
            deltas.append(delta)
            if req.focus_role_id and rec.role_id == req.focus_role_id:
                focus_delta = delta

        top_movers = sorted(
            [d for d in deltas if d.score_delta > 0],
            key=lambda d: (-d.score_delta, -d.rank_delta, d.after_rank),
        )[:6]

        return SimulateResponse(
            added_skills=resolved_added,
            focus_role=focus_delta,
            top_movers=top_movers,
            updated_recommendations=updated.recommendations,
        )
