"""Application configuration, loaded from the environment."""
import os
from datetime import timedelta

from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Config:
    # Long enough to satisfy HS256 without a warning; still replace it in production.
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-replace-me-before-deploying-anywhere")

    # --- Database -------------------------------------------------------
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "instance", "reporting.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # --- Auth -----------------------------------------------------------
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=14)

    # --- CORS -----------------------------------------------------------
    CORS_ORIGINS = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]

    # --- Uploads --------------------------------------------------------
    UPLOAD_FOLDER = os.path.join(BASE_DIR, os.getenv("UPLOAD_FOLDER", "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH_MB", "32")) * 1024 * 1024
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}

    # --- Generated reports ----------------------------------------------
    GENERATED_FOLDER = os.path.join(BASE_DIR, "generated")

    # --- Mail -----------------------------------------------------------
    MAIL_ENABLED = _bool("MAIL_ENABLED", False)
    MAIL_SERVER = os.getenv("MAIL_SERVER", "")
    MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USE_TLS = _bool("MAIL_USE_TLS", True)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    MAIL_SENDER = os.getenv("MAIL_SENDER", "no-reply@sgs.com")

    # --- Certification expiry alerts ------------------------------------
    ALERT_THRESHOLDS = sorted(
        (int(d) for d in os.getenv("ALERT_THRESHOLDS", "60,30,7").split(",") if d.strip()),
        reverse=True,
    )
    SCHEDULER_ENABLED = _bool("SCHEDULER_ENABLED", True)

    # Frontend base URL, used to build portal links inside alert emails.
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SCHEDULER_ENABLED = False


CONFIGS = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(name=None):
    return CONFIGS.get(name or os.getenv("FLASK_ENV", "development"), DevelopmentConfig)
