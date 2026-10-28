import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "PR-Guardian AI Engine"
    PORT: int = 8000
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgrespassword@localhost:5432/pr_guardian")
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017/pr_guardian")
    
    # API Keys
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    
    # Critic Thresholds
    CRITIC_MIN_CONFIDENCE: float = 0.85
    MAX_FINDINGS_PER_FILE: int = 5
    
    # Fallback / Demo Mode
    ENABLE_FALLBACK_STORES: bool = True

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
