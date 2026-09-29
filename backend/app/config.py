"""Application settings loaded from environment variables / .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- ComfyUI engine -------------------------------------------------
    COMFY_HOST: str = "127.0.0.1:8188"
    COMFY_TIMEOUT: float = 600.0          # seconds to wait for a workflow to finish
    COMFY_POLL_INTERVAL: float = 0.5

    # --- Local file storage ----------------------------------------------
    # Generated images are written to STORAGE_DIR and served by FastAPI
    # itself under /files (StaticFiles mount) — no external object store.
    STORAGE_DIR: str = "generated"
    FILES_PUBLIC_BASE: str = "http://localhost:8000"  # base URL handed to the browser
    GALLERY_LIMIT: int = 60

    # --- AI Tool Studio ---------------------------------------------------
    # Kept separate from STORAGE_DIR because tool definitions are private
    # server-side inputs, not public workspace assets.
    TOOLS_DIR: str = "tool_data"
    TOOL_MAX_WORKFLOW_BYTES: int = 5 * 1024 * 1024

    # --- Model publishing -------------------------------------------------
    # Creator models are kept separate from generated assets and tool data.
    MODELS_DIR: str = "models"
    MODEL_MAX_BYTES: int = 20 * 1024 * 1024 * 1024
    MODEL_SAMPLE_MAX_BYTES: int = 20 * 1024 * 1024
    MODEL_FILE_EXTENSIONS: str = ".safetensors,.ckpt,.pt,.pth,.bin,.gguf"
    # Optional same-host ComfyUI filesystem root. Installation is disabled when unset.
    COMFY_MODEL_ROOT: str | None = None

    # --- App -------------------------------------------------------------
    APP_NAME: str = "Comfy Studio API"
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )
    # Development-only fallback for Next.js dev ports. Set empty in production.
    ALLOWED_ORIGIN_REGEX: str = (
        r"^https?://(localhost|127\.0\.0\.1|\[::1\]):[0-9]{2,5}$"
    )
    UPLOAD_MAX_BYTES: int = 10 * 1024 * 1024

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
