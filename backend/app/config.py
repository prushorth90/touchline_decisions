from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = Field(
        default="Development",
        validation_alias=AliasChoices("ENVIRONMENT", "ASPNETCORE_ENVIRONMENT"),
    )
    allowed_origins: str = Field(
        default="http://localhost:5173",
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "Cors__AllowedOrigins__0"),
    )
    max_request_body_kilobytes: int = Field(
        default=64,
        validation_alias=AliasChoices("MAX_REQUEST_BODY_KILOBYTES", "Security__MaxRequestBodyKilobytes"),
    )
    request_limit_per_minute: int = Field(
        default=120,
        validation_alias=AliasChoices("REQUEST_LIMIT_PER_MINUTE", "Security__RequestLimitPerMinute"),
    )
    fpl_base_url: str = Field(
        default="https://fantasy.premierleague.com/api/",
        validation_alias=AliasChoices("FPL_BASE_URL", "FplApi__BaseUrl"),
    )
    fpl_timeout_seconds: float = Field(
        default=15,
        validation_alias=AliasChoices("FPL_TIMEOUT_SECONDS", "FplApi__RequestTimeoutSeconds", "FplApi__TimeoutSeconds"),
    )
    redis_connection_string: str = Field(
        default="redis://localhost:6379",
        validation_alias=AliasChoices("REDIS_CONNECTION_STRING", "Redis__ConnectionString"),
    )
    postgres_connection_string: str = Field(
        default="postgresql+asyncpg://fpl:change_me@localhost:5432/fpl",
        validation_alias=AliasChoices("DATABASE_URL", "ConnectionStrings__PostgreSQL"),
    )
    recommendation_snapshot_minutes: int = Field(
        default=15,
        validation_alias=AliasChoices(
            "RECOMMENDATION_SNAPSHOT_MINUTES",
            "Persistence__RecommendationSnapshotMinutes",
        ),
    )
    apply_migrations: bool = Field(
        default=True,
        validation_alias=AliasChoices("APPLY_MIGRATIONS", "Persistence__ApplyMigrations"),
    )
    agent_directory: str = Field(
        default="/app/agents",
        validation_alias=AliasChoices("AGENT_DIRECTORY", "Coach__AgentDirectory"),
    )
    insights_source: Literal["fixture", "s3"] = "fixture"
    insights_fixture_path: Path = Path(__file__).parent / "fixtures" / "gameweek.json"
    report_bucket: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        value = self.postgres_connection_string
        if value.startswith("Host="):
            parts = dict(item.split("=", 1) for item in value.split(";") if "=" in item)
            return (
                "postgresql+asyncpg://"
                f"{quote_plus(parts.get('Username', 'fpl'))}:{quote_plus(parts.get('Password', 'change_me'))}@"
                f"{parts.get('Host', 'localhost')}:{parts.get('Port', '5432')}/{parts.get('Database', 'fpl')}"
            )
        return value

    @property
    def redis_url(self) -> str:
        value = self.redis_connection_string
        if "://" in value:
            return value
        endpoint, *options = value.split(",")
        option_values = dict(item.split("=", 1) for item in options if "=" in item)
        password = option_values.get("password")
        return f"redis://:{quote_plus(password)}@{endpoint}" if password else f"redis://{endpoint}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
