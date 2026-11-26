import json
from pathlib import Path
from app.schemas.models import RoleDefinition, SkillDefinition


class TaxonomyStore:
    """In-memory canonical store for skills ontology, prerequisite DAG, and career roles."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.skills: dict[str, SkillDefinition] = {}
        self.roles: dict[str, RoleDefinition] = {}
        self._load()

    def _load(self) -> None:
        skills_path = self.data_dir / "skills_graph.json"
        roles_path = self.data_dir / "roles_taxonomy.json"

        raw_skills = json.loads(skills_path.read_text(encoding="utf-8"))
        for item in raw_skills:
            skill = SkillDefinition.model_validate(item)
            self.skills[skill.id] = skill

        raw_roles = json.loads(roles_path.read_text(encoding="utf-8"))
        for item in raw_roles:
            role = RoleDefinition.model_validate(item)
            self.roles[role.id] = role

    def get_skill(self, skill_id: str) -> SkillDefinition | None:
        return self.skills.get(skill_id)

    def get_role(self, role_id: str) -> RoleDefinition | None:
        return self.roles.get(role_id)

    def list_skills(self) -> list[SkillDefinition]:
        return sorted(self.skills.values(), key=lambda s: (s.category, s.name))

    def list_roles(self) -> list[RoleDefinition]:
        return list(self.roles.values())

    def get_transitive_prerequisites(self, skill_ids: set[str]) -> set[str]:
        """Return all transitive prerequisites for a given set of skill IDs."""
        visited: set[str] = set()
        stack = list(skill_ids)
        while stack:
            current = stack.pop()
            skill = self.skills.get(current)
            if not skill:
                continue
            for prereq in skill.prerequisites:
                if prereq not in visited and prereq in self.skills:
                    visited.add(prereq)
                    stack.append(prereq)
        return visited

    def role_document_text(self, role: RoleDefinition) -> str:
        """Build rich semantic text representation of a role for dense embeddings."""
        core_names = [
            self.skills[sid].name for sid in role.core_skills if sid in self.skills
        ]
        nice_names = [
            self.skills[sid].name
            for sid in role.nice_to_have_skills
            if sid in self.skills
        ]
        topics = "; ".join(role.interview_topics)
        return (
            f"{role.title} in {role.domain} ({role.level} level, {role.work_style} focus). "
            f"{role.description} "
            f"Core skills: {', '.join(core_names)}. "
            f"Bonus skills: {', '.join(nice_names)}. "
            f"Key topics: {topics}."
        )

    def skill_document_text(self, skill: SkillDefinition) -> str:
        aliases = ", ".join(skill.aliases)
        return f"{skill.name} ({skill.category}). Also known as: {aliases}."
