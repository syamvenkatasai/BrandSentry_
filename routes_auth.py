import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.core.saml import get_sp_metadata, init_saml_auth
from app.models.user import User
from app.schemas.user import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    UpdateProfileRequest,
    ChangePasswordRequest,
)
from app.services.auth import AuthService
from app.repositories.user import UserRepository
from app.repositories.audit import AuditRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60, by_ip=True))],
)
def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    result = AuthService(db).login(request.email, request.password)
    if not result:
        logger.warning("Failed login attempt for %s", request.email)
        AuditRepository(db).create(
            action="LOGIN_FAILED",
            details=f"Failed login attempt for {request.email}",
            status="failure",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Set secure HttpOnly cookie alongside returning JWT payload
    response.set_cookie(
        key="access_token",
        value=result["access_token"],
        httponly=True,
        secure=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
    )

    logger.info("Login: %s", request.email)
    user_id = result["user"].id if hasattr(result["user"], "id") else None
    AuditRepository(db).create(
        action="LOGIN",
        user_id=user_id,
        details=f"User {request.email} logged in successfully",
        status="success",
    )
    return result


@router.post("/logout")
def logout(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response.delete_cookie(key="access_token")
    logger.info("Logout: %s", current_user.email)
    AuditRepository(db).create(
        action="LOGOUT",
        user_id=current_user.id,
        details=f"User {current_user.email} logged out",
        status="success",
    )
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/profile", response_model=UserResponse)
def update_profile(
    request: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = UserRepository(db)
    data = {k: v for k, v in request.model_dump().items() if v is not None}
    updated = repo.update_user(current_user.id, **data)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    AuditRepository(db).create(
        action="PROFILE_UPDATE",
        user_id=current_user.id,
        details=f"Updated profile for {current_user.email}",
        metadata=data,
        status="success",
    )
    return updated


@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    repo = UserRepository(db)
    ok = repo.change_password(current_user.id, request.current_password, request.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    AuditRepository(db).create(
        action="PASSWORD_CHANGE",
        user_id=current_user.id,
        details=f"Changed password for {current_user.email}",
        status="success",
    )
    return {"message": "Password updated successfully"}


# ── SAML SSO (Microsoft Entra ID) ───────────────────────────────────────────

@router.get("/sso/status")
def sso_status():
    """Returns whether SAML SSO is fully configured in settings."""
    return {"enabled": settings.sso_enabled}


@router.get("/sso/login")
async def sso_login(request: Request):
    if not settings.sso_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO is not configured")
    auth = await init_saml_auth(request)
    return RedirectResponse(auth.login())


@router.post("/sso/acs")
async def sso_acs(request: Request, db: Session = Depends(get_db)):
    """Assertion Consumer Service: the IdP POSTs the SAML response here after login."""
    if not settings.sso_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO is not configured")

    auth = await init_saml_auth(request)
    auth.process_response()

    errors = auth.get_errors()
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SAML error: {', '.join(errors)} - {auth.get_last_error_reason()}",
        )
    if not auth.is_authenticated():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SAML authentication failed")

    try:
        result = AuthService(db).login_from_saml(auth)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    logger.info("SSO login: %s", result["user"].email)
    user_id = result["user"].id if hasattr(result["user"], "id") else None
    AuditRepository(db).create(
        action="SSO_LOGIN",
        user_id=user_id,
        details=f"SSO login successful for {result['user'].email}",
        status="success",
    )

    frontend_base = settings.FRONTEND_URL.split(",")[0].strip() if settings.FRONTEND_URL else ""
    redirect_url = f"{frontend_base}/sso/callback" if frontend_base else "/sso/callback"
    response = RedirectResponse(redirect_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key="access_token",
        value=result["access_token"],
        httponly=True,
        secure=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
    )
    return response


@router.get("/sso/metadata")
def sso_metadata():
    """SP metadata XML — upload this to Microsoft Entra ID Enterprise App."""
    return Response(content=get_sp_metadata(), media_type="application/xml")

