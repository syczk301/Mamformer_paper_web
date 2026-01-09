from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mamformer Web"
    API_V1_STR: str = "/api"
    
    # Database
    # Default to SQLite for local development ease (Supabase connection failed: DNS error)
    DATABASE_URL: str = "sqlite:///./mamformer.db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "your_secret_key_change_this_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_TASK_ALWAYS_EAGER: bool = True  # Run tasks synchronously by default (no Redis needed)

    class Config:
        env_file = (".env", "../.env")

settings = Settings()
