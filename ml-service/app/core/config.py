from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    port: int = 8000
    cors_origins: str = "http://localhost:5000,http://localhost:5173"

    embedding_backend: str = "sentence_transformers"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dims: int = 768
    semantic_norm_mode: str = "zscore_sigmoid"

    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-4-hydrogen"

    openai_api_key: str = ""
    openai_model: str = "gpt-6-luna"

    data_dir: Path = BASE_DIR / "data"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
