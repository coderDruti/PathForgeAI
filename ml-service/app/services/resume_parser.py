import io
import re
from collections import Counter
from pypdf import PdfReader
from app.schemas.models import ParsedResumeResponse, Proficiency, UserSkillInput
from app.services.taxonomy import TaxonomyStore

SENIOR_CUES = ("architected", "led", "production", "scaled", "mentored", "senior", "staff", "principal", "expert")
BEGINNER_CUES = ("familiar", "basics", "coursework", "learning", "exposure", "intro")

DOMAIN_INTEREST_MAP = {
    "ML & Gen AI": ["Generative AI", "Machine Learning", "LLM Systems"],
    "Frontend": ["Frontend Architecture", "UI Engineering"],
    "Backend": ["Backend Systems", "Distributed APIs"],
    "Data Engineering": ["Data Pipelines", "Analytics"],
    "Cloud & DevOps": ["Cloud Infrastructure", "DevOps & SRE"],
    "Security": ["Cybersecurity", "AppSec"],
    "Mobile": ["Mobile Apps"],
    "Product & Design": ["Product Strategy", "Design Systems"],
}


class ResumeParser:
    """Extracts text, canonical skills, inferred proficiency, and experience years from PDFs."""

    def __init__(self, taxonomy: TaxonomyStore):
        self.taxonomy = taxonomy
        self._patterns: list[tuple[str, re.Pattern[str]]] = []
        for skill in taxonomy.skills.values():
            terms = [skill.name, *skill.aliases]
            for term in terms:
                clean = term.strip()
                if len(clean) < 2:
                    continue
                # Word-boundary aware match supporting symbols like C++ / Next.js
                escaped = re.escape(clean)
                pattern = re.compile(rf"(?<![a-zA-Z0-9]){escaped}(?![a-zA-Z0-9])", re.IGNORECASE)
                self._patterns.append((skill.id, pattern))

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
        return "\n".join(pages).strip()

    def parse_text(self, text: str, filename: str = "resume.pdf") -> ParsedResumeResponse:
        normalized_text = re.sub(r"\s+", " ", text).strip()
        lower_text = normalized_text.lower()

        hit_counts: Counter[str] = Counter()
        for skill_id, pattern in self._patterns:
            matches = pattern.findall(normalized_text)
            if matches:
                hit_counts[skill_id] += len(matches)

        extracted_skills: list[UserSkillInput] = []
        category_counts: Counter[str] = Counter()

        for skill_id, count in hit_counts.most_common():
            skill = self.taxonomy.skills[skill_id]
            proficiency = self._infer_proficiency(skill.name.lower(), lower_text, count)
            extracted_skills.append(
                UserSkillInput(skill_id=skill.id, name=skill.name, proficiency=proficiency)
            )
            category_counts[skill.category] += 1

        inferred_years = self._infer_experience_years(lower_text)
        summary = self._extract_summary(text, extracted_skills)

        suggested_interests: list[str] = []
        for cat, _ in category_counts.most_common(3):
            suggested_interests.extend(DOMAIN_INTEREST_MAP.get(cat, [])[:2])
        if not suggested_interests:
            suggested_interests = ["Full-Stack Engineering", "Generative AI"]

        return ParsedResumeResponse(
            filename=filename,
            extracted_text_length=len(normalized_text),
            inferred_experience_years=inferred_years,
            summary=summary,
            extracted_skills=extracted_skills,
            suggested_interests=suggested_interests[:6],
        )

    def parse_pdf(self, pdf_bytes: bytes, filename: str = "resume.pdf") -> ParsedResumeResponse:
        text = self.extract_text_from_pdf(pdf_bytes)
        if not text:
            raise ValueError("Could not extract readable text from the uploaded PDF.")
        return self.parse_text(text, filename=filename)

    @staticmethod
    def _infer_proficiency(skill_term: str, lower_text: str, count: int) -> Proficiency:
        idx = lower_text.find(skill_term)
        window = lower_text[max(0, idx - 80) : idx + 120] if idx != -1 else ""
        if any(cue in window for cue in BEGINNER_CUES) and count == 1:
            return "beginner"
        if count >= 3 or any(cue in window for cue in SENIOR_CUES):
            return "advanced"
        return "intermediate"

    @staticmethod
    def _infer_experience_years(lower_text: str) -> float:
        explicit = re.findall(r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)", lower_text)
        if explicit:
            years = [float(y) for y in explicit if 0 <= float(y) <= 35]
            if years:
                return round(max(years), 1)

        # Fallback: inspect date ranges like 2021 - 2025 or 2022 - Present
        year_matches = [int(y) for y in re.findall(r"\b(20[0-2]\d)\b", lower_text)]
        if len(year_matches) >= 2:
            span = max(year_matches) - min(year_matches)
            if 0 < span <= 25:
                return float(min(span, 15))
        return 1.0

    @staticmethod
    def _extract_summary(raw_text: str, skills: list[UserSkillInput]) -> str:
        lines = [line.strip() for line in raw_text.splitlines() if len(line.strip()) > 35]
        # Skip email/phone header lines
        content_lines = [
            line for line in lines if "@" not in line and not re.search(r"\+?\d[\d\s\-]{7,}", line)
        ]
        if content_lines:
            snippet = " ".join(content_lines[:3])
            return snippet[:420].strip()
        if skills:
            top = ", ".join(s.name for s in skills[:6])
            return f"Software professional experienced with {top}."
        return "Aspiring technologist exploring career growth opportunities."
