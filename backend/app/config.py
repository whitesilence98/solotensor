"""Application settings loaded from environment variables / .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_ENV_FILE), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- ComfyUI engine -------------------------------------------------
    COMFY_HOST: str = "127.0.0.1:8188"
    COMFY_TIMEOUT: float = 1800.0         # seconds to wait for a workflow to finish (30 min default)
    COMFY_POLL_INTERVAL: float = 0.5

    # --- Local file storage ----------------------------------------------
    # Generated images are written to STORAGE_DIR and served by FastAPI
    # itself under /files (StaticFiles mount) — no external object store.
    STORAGE_DIR: str = "generated"
    FILES_PUBLIC_BASE: str = "http://localhost:8000"  # base URL handed to the browser
    GALLERY_LIMIT: int = 500

    # --- AI Tool Studio ---------------------------------------------------
    # Kept separate from STORAGE_DIR because tool definitions are private
    # server-side inputs, not public workspace assets.
    TOOLS_DIR: str = "tool_data"
    TOOL_MAX_WORKFLOW_BYTES: int = 5 * 1024 * 1024

    # --- Model publishing -------------------------------------------------
    # Creator models are kept separate from generated assets and tool data.
    MODELS_DIR: str = "models"
    MODEL_MAX_BYTES: int = 200 * 1024 * 1024 * 1024  # 200 GB default (supports large video/diffusion models like LTX, Qwen, Wan, Flux)
    MODEL_SAMPLE_MAX_BYTES: int = 20 * 1024 * 1024
    MODEL_FILE_EXTENSIONS: str = ".safetensors,.ckpt,.pt,.pth,.bin,.gguf"
    # Optional same-host ComfyUI filesystem root. Installation is disabled when unset.
    COMFY_MODEL_ROOT: str | None = None

    # --- Code assistance -------------------------------------------------
    # Disabled by default so installing the dependency never starts paid calls.
    ASSISTANT_ENABLED: bool = False
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    ASSISTANT_TIMEOUT_SECONDS: float = 45.0

    # --- Creative director ------------------------------------------------
    DIRECTOR_ENABLED: bool = False
    DIRECTOR_PROVIDER: str = "local"
    DIRECTOR_MODEL: str = "claude-opus-5-5"
    LOCAL_LLM_URL: str = "http://127.0.0.1:11434"
    LOCAL_LLM_MODEL: str = ""
    LOCAL_LLM_TIMEOUT_SECONDS: float = 120.0

    # --- AI provider credentials ------------------------------------------
    # Optional: the Anthropic SDK resolves OAuth/WIF profiles on its own.
    ANTHROPIC_API_KEY: str | None = None
    LOCAL_LLM_API_KEY: str | None = None

    # --- Outbound network -------------------------------------------------
    # Transport-only HTTP proxy for outbound AI calls (never ComfyUI).
    PROXY_URL: str = ""
    PROXY_BYPASS_LOCAL: bool = True

    # --- App -------------------------------------------------------------
    APP_NAME: str = "Comfy Studio API"
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )
    # Development-only fallback for Next.js dev ports. Set empty in production.
    ALLOWED_ORIGIN_REGEX: str = (
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|\[::1\]):[0-9]{2,5}$"
    )
    UPLOAD_MAX_BYTES: int = 10 * 1024 * 1024

    # --- Database & Authentication ---------------------------------------
    DATABASE_URL: str | None = None       # e.g. postgresql://user:pass@host:5432/dbname (Supabase/Neon)
    DB_PATH: str = "solotensor.db"        # SQLite fallback if DATABASE_URL is not set
    AUTH_PROVIDER: str = "local"
    JWT_SECRET: str = "solotensor-jwt-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    DEFAULT_DAILY_CREDITS: int = 100
    DEFAULT_GENERATION_COST: int = 2
    DEFAULT_STANDALONE_FEATURE_COST: int = 1

    # --- Redis & Task Queue (Phase 2) -----------------------------------
    REDIS_URL: str | None = None          # e.g. rediss://default:...@...upstash.io:6379

    # --- Hybrid S3 / Cloudflare R2 Storage (Phase 2) -------------------
    S3_ENABLED: bool = False
    S3_BUCKET: str | None = None
    S3_ENDPOINT_URL: str | None = None    # e.g. https://<account_id>.r2.cloudflarestorage.com
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_REGION: str = "auto"
    S3_PUBLIC_BASE_URL: str | None = None # e.g. https://pub-<hash>.r2.dev or custom CDN domain

    # --- Email & Verification --------------------------------------------
    FRONTEND_URL: str = "http://localhost:3000"
    RESEND_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "Solo Studio <noreply@solotensor.ai>"

    @property
    def comfy_http(self) -> str:
        return f"http://{self.COMFY_HOST}"

    @property
    def comfy_ws(self) -> str:
        return f"ws://{self.COMFY_HOST}"

    @property
    def origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def origin_regex(self) -> str | None:
        regex = self.ALLOWED_ORIGIN_REGEX.strip()
        return regex or None

    @property
    def effective_database_url(self) -> str | None:
        import sys

        if "unittest" in sys.modules or "pytest" in sys.modules:
            return None
        return self.DATABASE_URL


@lru_cache
def get_settings() -> Settings:
    return Settings()