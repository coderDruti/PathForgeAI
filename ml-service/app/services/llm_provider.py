import json
import logging
import time
from typing import Literal
from pydantic import BaseModel, Field
from app.core.config import Settings
from app.schemas.models import CapstoneProject

logger = logging.getLogger(__name__)

TRANSIENT_MARKERS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand", "overloaded")


class NodeEnrichment(BaseModel):
    skill_id: str
    objective: str
    project_idea: str


class LLMRoadmapEnrichment(BaseModel):
    personalized_summary: str
    node_enrichments: list[NodeEnrichment] = Field(default_factory=list)
    capstone_project: CapstoneProject
    interview_questions: list[str] = Field(default_factory=list)


class LLMProvider:
    """
    Provider-agnostic Gen AI structured synthesis adapter supporting:
    - Google Gemini (google-genai) with transient 503/429 retry
    - OpenAI (openai) compatible with reasoning and GPT-5/6+ models (default temperature)
    - Deterministic grounded fallback when API keys are not set or unreachable
    """

    def __init__(self, settings: Settings, retry_delay_seconds: float = 1.0):
        self.settings = settings
        self.retry_delay_seconds = retry_delay_seconds

    def enrich_roadmap(
        self, prompt_context: dict
    ) -> tuple[LLMRoadmapEnrichment | None, Literal["gemini", "openai", "fallback"]]:
        provider = self.settings.llm_provider.lower().strip()

        if provider == "gemini" and self.settings.gemini_api_key.strip():
            result = self._call_gemini(prompt_context)
            if result is not None:
                return result, "gemini"

        if provider == "openai" and self.settings.openai_api_key.strip():
            result = self._call_openai(prompt_context)
            if result is not None:
                return result, "openai"

        # Secondary failover if primary failed or wasn't configured and the other key exists
        if provider != "gemini" and self.settings.gemini_api_key.strip():
            result = self._call_gemini(prompt_context)
            if result is not None:
                return result, "gemini"
        if provider != "openai" and self.settings.openai_api_key.strip():
            result = self._call_openai(prompt_context)
            if result is not None:
                return result, "openai"

        return None, "fallback"

    @staticmethod
    def _build_prompt(ctx: dict) -> str:
        return (
            "You are a principal career architect and technical mentor.\n"
            "Given the grounded skill-gap graph below, synthesize personalized career guidance.\n"
            "STRICT RULES:\n"
            "1. Only reference `skill_id` values present in `graph_nodes`. Never invent new skill IDs.\n"
            "2. Keep each node `objective` concise (1-2 actionable sentences) and `project_idea` concrete.\n"
            "3. Design a resume-worthy `capstone_project` bridging the user's current skills and target role gaps.\n"
            "4. Provide 5 targeted `interview_questions` tailored to this user's transition.\n"
            "Return ONLY valid JSON matching the schema.\n\n"
            f"CONTEXT:\n{json.dumps(ctx, indent=2)}"
        )

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        msg = str(exc)
        return any(marker.lower() in msg.lower() for marker in TRANSIENT_MARKERS)

    def _call_gemini(self, ctx: dict, max_attempts: int = 2) -> LLMRoadmapEnrichment | None:
        try:
            from google import genai
            from google.genai import types
        except Exception as exc:
            logger.warning("google-genai SDK unavailable: %s", exc)
            return None

        client = genai.Client(api_key=self.settings.gemini_api_key)
        prompt = self._build_prompt(ctx)

        for attempt in range(1, max_attempts + 1):
            try:
                response = client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=LLMRoadmapEnrichment,
                        temperature=0.35,
                    ),
                )
                if response.text:
                    return LLMRoadmapEnrichment.model_validate_json(response.text)
                return None
            except Exception as exc:
                if attempt < max_attempts and self._is_transient_error(exc):
                    delay = self.retry_delay_seconds * attempt
                    logger.warning(
                        "Gemini transient error on attempt %d/%d (%s); retrying in %.1fs...",
                        attempt,
                        max_attempts,
                        self.settings.gemini_model,
                        delay,
                    )
                    time.sleep(delay)
                    continue
                logger.warning("Gemini roadmap enrichment failed; falling back gracefully: %s", exc)
                return None
        return None

    def _call_openai(self, ctx: dict) -> LLMRoadmapEnrichment | None:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.openai_api_key)
            parse_fn = getattr(client.chat.completions, "parse", None) or client.beta.chat.completions.parse

            # Omit explicit `temperature` so newer reasoning / GPT-5+ / GPT-6 models
            # that only accept the default temperature work without HTTP 400 errors.
            completion = parse_fn(
                model=self.settings.openai_model,
                messages=[
                    {"role": "system", "content": "You produce strict structured JSON career roadmaps."},
                    {"role": "user", "content": self._build_prompt(ctx)},
                ],
                response_format=LLMRoadmapEnrichment,
            )
            parsed = completion.choices[0].message.parsed
            if parsed is not None:
                return parsed
        except Exception as exc:
            logger.warning("OpenAI roadmap enrichment failed; falling back gracefully: %s", exc)
        return None
