from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./margin.db"
    database_url_unpooled: str = ""

    neon_auth_jwks_url: str = ""
    neon_auth_issuer: str = ""
    neon_auth_audience: str = ""
    auth_dev_bypass: bool = False

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    helper_model: str = "openai/gpt-oss-120b"

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    thread_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"
    thread_model_system_as_user: bool = False

    thread_keep_recent: int = 8
    thread_summarize_after: int = 12

    aws_endpoint_url_s3: str = ""
    aws_region: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    storage_bucket: str = "assets"

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
