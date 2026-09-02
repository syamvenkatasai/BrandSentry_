import json
import logging
import os
import typing
from typing import Any, Dict, Optional
from urllib.parse import quote_plus
from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Key mappings from AWS Secrets Manager / environment keys to Settings attributes
_SECRET_KEY_ALIASES = {
    "SPIL-AI-BS-GCS-API-KEY": "GOOGLE_API_KEY",
    "SPIL_AI_BS_GCS_API_KEY": "GOOGLE_API_KEY",
    "SPIL-AI-BS-GCS-ENGINE-ID": "GOOGLE_CSE_ID",
    "SPIL_AI_BS_GCS_ENGINE_ID": "GOOGLE_CSE_ID",
    "SPIL-AI-BRANDSENTRY_API_URL": "SPIL_AI_BRANDSENTRY_API_URL",
    "SPIL-AI-BRANDSENTRY_API_KEY": "SPIL_AI_BRANDSENTRY_API_KEY",
    "SPIL-AI-BRANDSENTRY_MODEL_ID": "SPIL_AI_BRANDSENTRY_MODEL_ID",
    "ENV": "APP_ENV",
    "DB PASSWORD": "DB_PASSWORD",
    "DB USER": "DB_USER",
    "DB HOST": "DB_HOST",
    "DB PORT": "DB_PORT",
    "DB NAME": "DB_NAME",
    "DATABASE_NAME": "DB_NAME",
}



def _load_secrets_manager_config() -> dict:
    """Fetch configuration and secrets directly from AWS Secrets Manager into memory.

    The secret name/ARN is read from the AWS_SECRETS_MANAGER_SECRET_NAME or
    SECRET_NAME environment variable (passed to the container / task definition).
    AWS credentials and region are resolved through boto3's standard AWS credential
    chain (ECS Task Role, EC2 Instance Profile, AWS_REGION / AWS_DEFAULT_REGION, or
    local profile).
    Zero .env file is required on the host/container.
    """
    secret_name = (
        os.environ.get("AWS_SECRETS_MANAGER_SECRET_NAME")
        or os.environ.get("SECRET_NAME")
        or os.environ.get("SECRETS_NAME")
    )
    region = (
        os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
    )
    if not region and secret_name and secret_name.startswith("arn:aws:secretsmanager:"):
        parts = secret_name.split(":")
        if len(parts) >= 4:
            region = parts[3]

    config: Dict[str, Any] = {}

    # 1. Read from AWS Secrets Manager if configured
    if secret_name:
        logger.info(
            "Fetching configuration from AWS Secrets Manager (SecretId='%s', region='%s')...",
            secret_name,
            region or "default",
        )
        try:
            import boto3
            from botocore.config import Config as BotoConfig
            from botocore.exceptions import BotoCoreError, ClientError

            client = boto3.client(
                "secretsmanager",
                region_name=region,
                config=BotoConfig(connect_timeout=5, read_timeout=10, retries={"max_attempts": 3}),
            )
            response = client.get_secret_value(SecretId=secret_name)
            secret_str = response.get("SecretString")
            if secret_str:
                raw_secrets = json.loads(secret_str)
            else:
                raw_secrets = json.loads(response.get("SecretBinary", b"{}").decode("utf-8"))
            logger.info("Successfully loaded %d secret key(s) from AWS Secrets Manager (SecretId='%s', region='%s')", len(raw_secrets), secret_name, region or "default")
            print(f"[AWS SECRETS MANAGER] Successfully loaded {len(raw_secrets)} secret key(s) from SecretId='{secret_name}' (region='{region or 'default'}')", flush=True)

            # Normalize and copy raw secrets
            for k, v in raw_secrets.items():
                if v is not None:
                    val_str = str(v).strip()
                    mapped_key = _SECRET_KEY_ALIASES.get(k, k.replace("-", "_"))
                    config[mapped_key] = val_str
                    config[k] = val_str

            # If a custom field name for Google key was configured, map it to GOOGLE_API_KEY
            google_key_field = config.get("AWS_SECRETS_MANAGER_GOOGLE_KEY_FIELD") or raw_secrets.get("AWS_SECRETS_MANAGER_GOOGLE_KEY_FIELD")
            if google_key_field and google_key_field in raw_secrets:
                config["GOOGLE_API_KEY"] = str(raw_secrets[google_key_field]).strip()

            # Construct DATABASE_URL if individual DB components were provided
            if not config.get("DATABASE_URL"):
                db_user = raw_secrets.get("DB_USER") or raw_secrets.get("db_user") or raw_secrets.get("DB USER")
                db_pass = (
                    raw_secrets.get("DB_PASSWORD")
                    or raw_secrets.get("DB PASSWORD")
                    or raw_secrets.get("db_password")
                )
                db_host = raw_secrets.get("DB_HOST") or raw_secrets.get("db_host") or raw_secrets.get("DB HOST")
                db_port = raw_secrets.get("DB_PORT") or raw_secrets.get("db_port") or raw_secrets.get("DB PORT") or "5432"
                db_name = raw_secrets.get("DB_NAME") or raw_secrets.get("db_name") or raw_secrets.get("DB NAME") or "postgres"
                if db_host and db_user and db_pass is not None:
                    encoded_pass = quote_plus(str(db_pass))
                    config["DATABASE_URL"] = (
                        f"postgresql+psycopg2://{db_user}:{encoded_pass}@{db_host}:{db_port}/{db_name}"
                    )
                    logger.info("Constructed DATABASE_URL from DB_HOST/DB_USER/DB_PASSWORD components")
                    print("[DATABASE] Constructed DATABASE_URL from Secrets Manager components", flush=True)
        except Exception as exc:
            logger.error(
                "Failed to load secrets from AWS Secrets Manager (SecretId='%s', region='%s'): %s",
                secret_name,
                region or "default",
                exc,
            )
            print(f"[AWS SECRETS MANAGER ERROR] Failed to load secrets from SecretId='{secret_name}': {exc}", flush=True)
            raise RuntimeError(
                f"Failed to load required secrets from AWS Secrets Manager (SecretId='{secret_name}'). "
                f"Check IAM permissions (secretsmanager:GetSecretValue) and region. Error: {exc}"
            ) from exc
    else:
        logger.info(
            "No AWS_SECRETS_MANAGER_SECRET_NAME / SECRET_NAME provided. Using environment/fallback values."
        )
        print("[AWS SECRETS MANAGER] No AWS_SECRETS_MANAGER_SECRET_NAME provided. Running with local/environment fallbacks.", flush=True)

    # 2. Merge OS environment variables (allows runtime overrides if passed to container)
    for env_k, env_v in os.environ.items():
        if env_v and (env_k not in config or not config[env_k]):
            mapped_key = _SECRET_KEY_ALIASES.get(env_k, env_k.replace("-", "_"))
            config[mapped_key] = env_v
            config[env_k] = env_v

    # 3. Handle defaults if not supplied in Secrets Manager
    if not config.get("BACKEND_URL"):
        config["BACKEND_URL"] = ""
    if not config.get("FRONTEND_URL"):
        config["FRONTEND_URL"] = ""
    if not config.get("SECRET_KEY"):
        if not secret_name:
            config["SECRET_KEY"] = "dev-secret-key-brandsentry-32chars-minimum-fallback"
    if not config.get("DATABASE_URL"):
        if not secret_name:
            config["DATABASE_URL"] = "sqlite:///./brandsentry.db"

    return config


class Settings(BaseSettings):
    APP_NAME: str = "BrandSentry Platform API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    APP_ENV: str = "development"

    # Root log level for the whole app — DEBUG/INFO/WARNING/ERROR/CRITICAL.
    LOG_LEVEL: str = "INFO"

    # PostgreSQL in production/staging (per SDD §4); sqlite for local dev.
    DATABASE_URL: str = "sqlite:///./brandsentry.db"

    # Required — sourced from AWS Secrets Manager, no hardcoded fallback in prod.
    SECRET_KEY: str = "dev-secret-key-brandsentry-32chars-minimum-fallback"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Redis URL for distributed caching / rate limiting
    REDIS_URL: Optional[str] = None

    # Comma-separated list of allowed origins for the frontend dev/prod hosts.
    CORS_ORIGINS: Optional[str] = None

    # Application base URLs (sourced from Secrets Manager / environment)
    BACKEND_URL: str = ""
    FRONTEND_URL: str = ""

    # SPIL AI / Model settings (from Secrets Manager or SSM)
    SPIL_AI_BRANDSENTRY_API_URL: Optional[str] = None
    SPIL_AI_BRANDSENTRY_API_KEY: Optional[str] = None
    SPIL_AI_BRANDSENTRY_MODEL_ID: Optional[str] = None

    AWS_REGION: str = "ap-south-1"  # Mumbai

    BEDROCK_API_KEY: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_SESSION_TOKEN: Optional[str] = None
    BEDROCK_EMBEDDING_MODEL_ID: str = "amazon.titan-embed-text-v2:0"
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-haiku-20240307-v1:0"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v:
            raise ValueError("SECRET_KEY must not be empty")
        if "change-this" in v.lower() or "REPLACE_THIS" in v:
            raise ValueError("SECRET_KEY must be changed from placeholder before deployment")
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long for cryptographic security")
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v or not (
            v.startswith("postgresql://")
            or v.startswith("postgresql+psycopg2://")
            or v.startswith("postgresql+asyncpg://")
            or v.startswith("sqlite://")
        ):
            raise ValueError("DATABASE_URL must be a valid PostgreSQL or SQLite connection string")
        return v

    # --- SAML 2.0 SSO (Microsoft Entra ID) ---
    SAML_SP_ENTITY_ID: str = ""
    SAML_SP_ACS_URL: str = ""
    SAML_SP_NAME_ID_FORMAT: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    SAML_SP_X509_CERT: str = ""
    SAML_SP_PRIVATE_KEY: str = ""
    SAML_IDP_ENTITY_ID: str = ""
    SAML_IDP_SSO_URL: str = ""
    SAML_IDP_X509_CERT: str = ""
    SAML_ROLE_ATTRIBUTE: str = ""

    # Google Custom Search JSON API
    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_CSE_ID: Optional[str] = None

    # Pure Python DiskCache Directory (zero external servers needed)
    CACHE_DIR: str = "./.cache"

    # Default on/off state for each Brand Analysis data source
    WHO_INN_ENABLED: bool = True
    IQVIA_ENABLED: bool = True
    EPHARMACY_SCRAPE_ENABLED: bool = True
    GOOGLE_SEARCH_ENABLED: bool = True

    # AWS Systems Manager & Secrets Manager keys
    AWS_SECRETS_MANAGER_SECRET_NAME: Optional[str] = None
    AWS_SECRETS_MANAGER_GOOGLE_KEY_FIELD: Optional[str] = None
    AWS_SSM_PARAMETER_MAP: Optional[str] = None

    class Config:
        case_sensitive = False
        extra = "ignore"

    @property
    def saml_sp_entity_id(self) -> str:
        return self.SAML_SP_ENTITY_ID or f"{self.BACKEND_URL}/auth/sso/metadata"

    @property
    def saml_sp_acs_url(self) -> str:
        return self.SAML_SP_ACS_URL or f"{self.BACKEND_URL}/auth/sso/acs"

    @property
    def sso_enabled(self) -> bool:
        return bool(self.SAML_IDP_ENTITY_ID and self.SAML_IDP_SSO_URL and self.SAML_IDP_X509_CERT)


settings = Settings(**_load_secrets_manager_config())


def validate_required_settings() -> None:
    """Validate that required settings are set."""
    if not settings.SECRET_KEY:
        raise RuntimeError("Required setting SECRET_KEY is not set.")


def load_settings_from_parameter_store() -> None:
    """Compatibility loader for AWS Systems Manager Parameter Store if configured."""
    if not settings.AWS_SSM_PARAMETER_MAP:
        return

    try:
        field_to_param = json.loads(settings.AWS_SSM_PARAMETER_MAP)
    except Exception as exc:
        logger.warning("[PARAMETER STORE] AWS_SSM_PARAMETER_MAP is not valid JSON: %s", exc)
        return

    if not field_to_param:
        return

    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

        client = boto3.session.Session().client(service_name="ssm", region_name=settings.AWS_REGION)
        param_to_field = {v: k for k, v in field_to_param.items() if k in Settings.model_fields}
        param_names = list(param_to_field.keys())
        for i in range(0, len(param_names), 10):
            batch = param_names[i:i + 10]
            try:
                response = client.get_parameters(Names=batch, WithDecryption=True)
                for p in response.get("Parameters", []):
                    field_name = param_to_field.get(p["Name"])
                    if field_name:
                        setattr(settings, field_name, p["Value"])
            except Exception as exc:
                logger.warning("[PARAMETER STORE] Failed to load batch %s: %s", batch, exc)
    except Exception as exc:
        logger.warning("[PARAMETER STORE] boto3 SSM fetch error: %s", exc)
