import re
import numpy as np
from app.schemas.models import Proficiency, SkillDefinition, UserSkillInput
from app.services.embeddings import EmbeddingService
from app.services.taxonomy import TaxonomyStore

PROFICIENCY_RANK: dict[Proficiency, int] = {
    "beginner": 1,
    "intermediate": 2,
    "advanced": 3,
}


def normalize_token(text: str) -> str:
    cleaned = text.lower().strip()
    cleaned = re.sub(r"[^a-z0-9+#./\s-]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


class SkillMatcher:
    """
    Two-stage canonical skill resolver:
    1. Exact ID / canonical name / alias dictionary match.
    2. Semantic cosine-similarity fallback over skill embeddings (threshold >= 0.72).
    """

    def __init__(self, taxonomy: TaxonomyStore, embeddings: EmbeddingService):
        self.taxonomy = taxonomy
        self.embeddings = embeddings
        self.alias_to_id: dict[str, str] = {}
        self.skill_ids: list[str] = []
        self.skill_matrix: np.ndarray = np.zeros((0, 1), dtype=np.float32)
        self._build_index()

    def _build_index(self) -> None:
        texts: list[str] = []
        for skill in self.taxonomy.skills.values():
            self.skill_ids.append(skill.id)
            texts.append(self.taxonomy.skill_document_text(skill))
            candidates = [skill.id, skill.id.replace("_", " "), skill.name, *skill.aliases]
            for c in candidates:
                norm = normalize_token(c)
                if norm:
                    self.alias_to_id[norm] = skill.id
        if texts:
            self.skill_matrix = self.embeddings.encode(texts)

    def resolve_one(self, raw_skill: UserSkillInput) -> tuple[SkillDefinition | None, float]:
        # 1. Direct canonical skill_id
        if raw_skill.skill_id and raw_skill.skill_id in self.taxonomy.skills:
            return self.taxonomy.skills[raw_skill.skill_id], 1.0

        # 2. Exact normalized name/alias match
        norm = normalize_token(raw_skill.name)
        if norm in self.alias_to_id:
            sid = self.alias_to_id[norm]
            return self.taxonomy.skills[sid], 1.0

        # 3. Semantic embedding fallback
        if norm and self.skill_matrix.shape[0] > 0:
            vec = self.embeddings.encode([raw_skill.name])[0]
            sims = self.embeddings.cosine_similarity(vec, self.skill_matrix)
            best_idx = int(np.argmax(sims))
            best_score = float(sims[best_idx])
            if best_score >= 0.72:
                return self.taxonomy.skills[self.skill_ids[best_idx]], best_score

        return None, 0.0

    def resolve_user_skills(
        self, raw_skills: list[UserSkillInput]
    ) -> tuple[dict[str, Proficiency], list[UserSkillInput]]:
        """
        Resolve and deduplicate a user's skills, keeping the highest proficiency
        when multiple inputs map to the same canonical skill.
        """
        resolved_map: dict[str, Proficiency] = {}
        unresolved: list[UserSkillInput] = []

        for item in raw_skills:
            skill_def, _ = self.resolve_one(item)
            if skill_def is not None:
                prev = resolved_map.get(skill_def.id)
                if prev is None or PROFICIENCY_RANK[item.proficiency] > PROFICIENCY_RANK[prev]:
                    resolved_map[skill_def.id] = item.proficiency
            elif item.name.strip():
                unresolved.append(item)

        resolved_list: list[UserSkillInput] = [
            UserSkillInput(
                skill_id=sid,
                name=self.taxonomy.skills[sid].name,
                proficiency=prof,
            )
            for sid, prof in resolved_map.items()
        ]
        resolved_list.extend(unresolved)
        return resolved_map, resolved_list
