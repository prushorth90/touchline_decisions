from app.config import Settings


def test_dotnet_connection_strings_remain_supported() -> None:
    settings = Settings(**{"ConnectionStrings__PostgreSQL": "Host=db;Port=5433;Database=fpl;Username=user;Password=p@ss", "Redis__ConnectionString": "cache:6379,password=secret"})
    assert settings.sqlalchemy_url == "postgresql+asyncpg://user:p%40ss@db:5433/fpl"
    assert settings.redis_url == "redis://:secret@cache:6379"