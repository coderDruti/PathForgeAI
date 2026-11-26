from collections import defaultdict, deque
import math
from app.schemas.models import (
    CapstoneProject,
    RoadmapEdge,
    RoadmapNode,
    RoadmapRequest,
    RoadmapResponse,
)
from app.services.llm_provider import LLMProvider
from app.services.recommender import HybridCareerRecommender
from app.services.skill_matcher import SkillMatcher
from app.services.taxonomy import TaxonomyStore


class GroundedRoadmapGenerator:
    """
    Two-stage Grounded RAG Roadmap Generator:
    1. Deterministic topological DAG builder (Kahn's algorithm) over canonical prerequisites.
    2. LLM structured enrichment (Gemini/OpenAI) with strict guardrail validation + fallback.
    """

    def __init__(
        self,
        taxonomy: TaxonomyStore,
        matcher: SkillMatcher,
        recommender: HybridCareerRecommender,
        llm_provider: LLMProvider,
    ):
        self.taxonomy = taxonomy
        self.matcher = matcher
        self.recommender = recommender
        self.llm_provider = llm_provider

    def generate(self, req: RoadmapRequest) -> RoadmapResponse:
        role = self.taxonomy.get_role(req.role_id)
        if role is None:
            raise KeyError(f"Unknown role_id: {req.role_id}")

        resolved_map, resolved_list = self.matcher.resolve_user_skills(req.profile.skills)
        rec_resp = self.recommender.recommend(req.profile)
        role_rec = next((r for r in rec_resp.recommendations if r.role_id == role.id), None)
        readiness_score = role_rec.match_score if role_rec else 0.0

        # Gather all core skills + top 2 nice-to-have skills + transitive prerequisites
        core_ids = set(role.core_skills.keys())
        top_nice_ids = set(
            sorted(
                role.nice_to_have_skills.keys(),
                key=lambda sid: -role.nice_to_have_skills[sid],
            )[:2]
        )
        target_ids = core_ids | top_nice_ids
        prereq_ids = self.taxonomy.get_transitive_prerequisites(target_ids)
        all_node_ids = (target_ids | prereq_ids) & set(self.taxonomy.skills.keys())

        # Determine completed skills (intermediate or advanced)
        completed_ids = {
            sid
            for sid in all_node_ids
            if sid in resolved_map and resolved_map[sid] in ("intermediate", "advanced")
        }

        # Build induced DAG & compute topological order + depth via Kahn's algorithm
        in_degree: dict[str, int] = {sid: 0 for sid in all_node_ids}
        adj: dict[str, list[str]] = defaultdict(list)
        edges: list[RoadmapEdge] = []

        for sid in sorted(all_node_ids):
            skill = self.taxonomy.skills[sid]
            for prereq in skill.prerequisites:
                if prereq in all_node_ids:
                    adj[prereq].append(sid)
                    in_degree[sid] += 1
                    edges.append(
                        RoadmapEdge(id=f"{prereq}->{sid}", source=prereq, target=sid)
                    )

        depth: dict[str, int] = {sid: 0 for sid in all_node_ids}
        queue = deque(sorted(sid for sid, deg in in_degree.items() if deg == 0))
        topo_order: list[str] = []

        while queue:
            curr = queue.popleft()
            topo_order.append(curr)
            for nxt in sorted(adj[curr]):
                depth[nxt] = max(depth[nxt], depth[curr] + 1)
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    queue.append(nxt)

        # Guard against unexpected graph cycles
        if len(topo_order) < len(all_node_ids):
            remaining = sorted(all_node_ids - set(topo_order))
            topo_order.extend(remaining)

        # Schedule weeks sequentially across remaining uncompleted skills
        weekly_hours = max(1, req.profile.weekly_hours)
        cumulative_hours = 0
        nodes: list[RoadmapNode] = []

        for sid in topo_order:
            skill = self.taxonomy.skills[sid]
            prereqs_in_graph = [p for p in skill.prerequisites if p in all_node_ids]
            is_completed = sid in completed_ids

            if sid in core_ids:
                priority = "core"
            elif sid in top_nice_ids:
                priority = "nice_to_have"
            else:
                priority = "prerequisite"

            if is_completed:
                status = "completed"
                est_hours = 0
                week_start = 0
                week_end = 0
            else:
                all_prereqs_done = all(p in completed_ids for p in prereqs_in_graph)
                status = "unlocked" if all_prereqs_done else "locked"
                # Halve estimated hours if user already has beginner exposure
                est_hours = (
                    max(6, round(skill.estimated_hours * 0.5))
                    if resolved_map.get(sid) == "beginner"
                    else skill.estimated_hours
                )
                week_start = math.floor(cumulative_hours / weekly_hours) + 1
                cumulative_hours += est_hours
                week_end = max(week_start, math.ceil(cumulative_hours / weekly_hours))

            default_project = (
                skill.project_prompts[0]
                if skill.project_prompts
                else f"Build a hands-on {skill.name} module integrated into your {role.title} portfolio."
            )
            default_objective = (
                f"Already proficient in {skill.name} — apply it directly in system integration."
                if is_completed
                else f"Master {skill.name} fundamentals and production patterns required for {role.title}."
            )

            nodes.append(
                RoadmapNode(
                    id=sid,
                    skill_id=sid,
                    label=skill.name,
                    category=skill.category,
                    status=status,
                    priority=priority,
                    estimated_hours=est_hours,
                    week_start=week_start,
                    week_end=week_end,
                    depth=depth[sid],
                    objective=default_objective,
                    project_idea=default_project,
                    resources=skill.resources,
                )
            )

        total_hours = cumulative_hours
        total_weeks = math.ceil(total_hours / weekly_hours) if total_hours > 0 else 0

        # Prepare grounded RAG context for LLM enrichment
        llm_ctx = {
            "target_role": {
                "title": role.title,
                "domain": role.domain,
                "level": role.level,
                "description": role.description,
            },
            "user": {
                "experience_years": req.profile.experience_years,
                "weekly_hours": weekly_hours,
                "current_skills": [f"{s.name} ({s.proficiency})" for s in resolved_list],
                "interests": req.profile.interests,
                "summary": req.profile.summary[:300],
            },
            "graph_nodes": [
                {
                    "skill_id": n.skill_id,
                    "label": n.label,
                    "status": n.status,
                    "priority": n.priority,
                    "estimated_hours": n.estimated_hours,
                }
                for n in nodes
            ],
            "baseline_interview_topics": role.interview_topics,
        }

        enrichment, mode = self.llm_provider.enrich_roadmap(llm_ctx)

        if enrichment is not None:
            # Strict guardrail: only apply enrichments for verified node IDs in our deterministic DAG
            enrich_by_id = {
                e.skill_id: e for e in enrichment.node_enrichments if e.skill_id in all_node_ids
            }
            for node in nodes:
                if node.skill_id in enrich_by_id:
                    node.objective = enrich_by_id[node.skill_id].objective
                    node.project_idea = enrich_by_id[node.skill_id].project_idea

            personalized_summary = enrichment.personalized_summary
            capstone = enrichment.capstone_project
            interview_questions = enrichment.interview_questions[:6] or role.interview_topics
        else:
            personalized_summary, capstone, interview_questions = self._build_fallback_content(
                role.title,
                role.domain,
                role.interview_topics,
                nodes,
                [s.name for s in resolved_list],
                total_weeks,
                weekly_hours,
            )

        return RoadmapResponse(
            role_id=role.id,
            role_title=role.title,
            domain=role.domain,
            readiness_score=readiness_score,
            estimated_total_hours=total_hours,
            estimated_total_weeks=total_weeks,
            generation_mode=mode,
            personalized_summary=personalized_summary,
            nodes=nodes,
            edges=edges,
            capstone_project=capstone,
            interview_questions=interview_questions,
        )

    @staticmethod
    def _build_fallback_content(
        role_title: str,
        domain: str,
        interview_topics: list[str],
        nodes: list[RoadmapNode],
        current_skills: list[str],
        total_weeks: int,
        weekly_hours: int,
    ) -> tuple[str, CapstoneProject, list[str]]:
        missing_nodes = [n for n in nodes if n.status != "completed"]
        completed_nodes = [n for n in nodes if n.status == "completed"]

        focus_names = [n.label for n in missing_nodes[:4]]
        strong_names = [n.label for n in completed_nodes[:3]] or current_skills[:3]

        if not missing_nodes:
            summary = (
                f"You already meet the core technical bar for {role_title}. "
                f"Use the capstone project and interview checklist below to sharpen system design depth and ship resume-ready evidence."
            )
        else:
            strength_part = (
                f"Building on your background in {', '.join(strong_names)}, "
                if strong_names
                else ""
            )
            summary = (
                f"{strength_part}this {total_weeks}-week roadmap ({weekly_hours} hrs/week) "
                f"closes {len(missing_nodes)} prerequisite-ordered skill gaps for {role_title}, "
                f"prioritizing {', '.join(focus_names)}."
            )

        stack = [n.label for n in (missing_nodes[:4] + completed_nodes[:3])][:6] or [role_title]
        capstone = CapstoneProject(
            title=f"Production {role_title} Portfolio Platform",
            overview=(
                f"Architect and deploy an end-to-end {domain} project combining "
                f"{', '.join(stack[:4])} with automated tests, observability, and measurable benchmarks."
            ),
            key_features=[
                f"Core workflow implementing {stack[0]} and {stack[min(1, len(stack) - 1)]} best practices",
                "Automated CI verification, integration tests, and reproducible Docker deployment",
                "Quantified benchmark report documenting latency, accuracy, or throughput trade-offs",
                "Architecture decision record (ADR) and live interactive demo",
            ],
            tech_stack=stack,
            resume_bullet_template=(
                f"Architected and deployed a {domain} platform using {', '.join(stack[:3])}, "
                f"achieving <150ms p95 API latency with automated test coverage and reproducible benchmarks."
            ),
        )

        questions = [
            f"Walk through how you would architect a scalable {topic.lower()} solution in production."
            if not topic.endswith("?")
            else topic
            for topic in interview_topics
        ]
        if len(questions) < 4:
            questions.append(
                f"Describe a trade-off you made while integrating {stack[0]} into a real system."
            )

        return summary, capstone, questions[:5]
