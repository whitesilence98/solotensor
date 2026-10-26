"""FastAPI routes and dependencies for SoloTensor Authentication, Credits, and Email Verification."""

from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..db import Database, get_db
from ..schemas import (
    ApiKeyCreateRequest,
    ApiKeyListItem,
    ApiKeyResponse,
    AvatarUploadResponse,
    ChangePasswordRequest,
    EmailActionResponse,
    ForgotPasswordRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserCreditsResponse,
    UserLoginRequest,
    UserMeResponse,
    UserRegisterRequest,
    UserResponse,
    VerifyEmailRequest,
)
from ..services.auth_service import (
    AuthProvider,
    UserAlreadyExistsError,
    get_auth_provider,
    hash_password,
    verify_password,
)
from ..services.credit_service import CreditService, get_credit_service
from ..services.mailer_service import MailerService, get_mailer_service
from ..services.storage import StorageService, get_storage

logger = logging.getLogger("solotensor.router.auth")
bearer_scheme = HTTPBearer(auto_error=False)


def _is_expired(expires_at: Any) -> bool:
    try:
        if isinstance(expires_at, datetime):
            dt = expires_at
        elif isinstance(expires_at, str):
            dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        else:
            return True

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > dt
    except Exception:
        return True


async def get_optional_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_solotensor_key: Optional[str] = Header(None, alias="X-SoloTensor-Key"),
    provider: AuthProvider = Depends(get_auth_provider),
) -> Optional[UserResponse]:
    """Dependency returning the authenticated User if a valid Bearer token or API key is provided,

    otherwise None (allowing guest/anonymous local use).
    """
    if auth and auth.credentials:
        user = provider.verify_token(auth.credentials)
        if user:
            return user
    if x_solotensor_key:
        user = provider.verify_api_key(x_solotensor_key)
        if user:
            return user
    return None


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_solotensor_key: Optional[str] = Header(None, alias="X-SoloTensor-Key"),
    provider: AuthProvider = Depends(get_auth_provider),
) -> UserResponse:
    """Dependency requiring authentication via Bearer token or X-SoloTensor-Key header."""
    user = await get_optional_user(auth, x_solotensor_key, provider)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_OR_MISSING_AUTHENTICATION",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    req: UserRegisterRequest,
    provider: AuthProvider = Depends(get_auth_provider),
    credits_svc: CreditService = Depends(get_credit_service),
    db: Database = Depends(get_db),
    mailer: MailerService = Depends(get_mailer_service),
) -> TokenResponse:
    """Register a new user, initialize 100 daily credits, and send email verification."""
    try:
        user = provider.create_user(
            email=req.email,
            username=req.username,
            password=req.password,
            display_name=req.display_name,
        )
    except UserAlreadyExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Automatically generate email verification token and trigger branded email
    try:
        token_record = db.create_auth_token(user.id, token_type="email_verification", expires_in_seconds=86400)
        await mailer.send_verification_email(user.email, user.username, token_record["token"], token_record["otp_code"])
    except Exception as exc:
        logger.warning("Could not dispatch verification email for %s: %s", user.email, exc)

    token = provider.create_token(user)
    credits_info = credits_svc.get_user_credits(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user,
        credits=credits_info,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    req: UserLoginRequest,
    provider: AuthProvider = Depends(get_auth_provider),
    credits_svc: CreditService = Depends(get_credit_service),
) -> TokenResponse:
    """Authenticate user with email/username and password, returning JWT token and credit balance."""
    user = provider.authenticate(req.identifier, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_CREDENTIALS",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = provider.create_token(user)
    credits_info = credits_svc.get_user_credits(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user,
        credits=credits_info,
    )


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    user: UserResponse = Depends(get_current_user),
    credits_svc: CreditService = Depends(get_credit_service),
) -> UserMeResponse:
    """Get current user profile and credit stats."""
    credits_info = credits_svc.get_user_credits(user.id)
    return UserMeResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        social_links=user.social_links or {},
        role=user.role,
        is_verified=user.is_verified,
        created_at=user.created_at,
        credits=credits_info,
        user=user,
        roles=user.roles,
        primary_role=user.primary_role,
        permissions=user.permissions,
    )


@router.patch("/profile", response_model=UserResponse)
@router.put("/profile", response_model=UserResponse)
async def update_profile(
    req: UpdateProfileRequest,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> UserResponse:
    """Update profile details (display_name, avatar_url, bio, social_links)."""
    db.update_user_profile(
        user.id,
        display_name=req.display_name,
        avatar_url=req.avatar_url,
        bio=req.bio,
        social_links=req.social_links,
    )
    updated = db.get_user_by_id(user.id)
    if not updated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    roles = db.get_user_roles(user.id)
    perms = db.get_user_permissions(user.id)
    return UserResponse(
        id=updated["id"],
        email=updated["email"],
        username=updated["username"],
        display_name=updated.get("display_name"),
        avatar_url=updated.get("avatar_url"),
        bio=updated.get("bio"),
        social_links=updated.get("social_links") or {},
        role=updated.get("role") or "creator",
        is_verified=bool(updated.get("is_verified", False)),
        created_at=str(updated.get("created_at")),
        roles=roles,
        primary_role=roles[0] if roles else (updated.get("role") or "creator"),
        permissions=list(perms),
    )


@router.post("/avatar", response_model=AvatarUploadResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: UserResponse = Depends(get_current_user),
    storage: StorageService = Depends(get_storage),
    db: Database = Depends(get_db),
) -> AvatarUploadResponse:
    """Upload user avatar image and update profile avatar_url."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File must be an image (PNG, JPEG, WebP)")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Avatar image exceeds 5MB limit")
    ext = Path(file.filename or "avatar.png").suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        ext = ".png"
    url = await storage.upload_asset(
        data=data,
        prompt_id="avatars",
        filename=f"avatar{ext}",
        content_type=file.content_type,
        namespace=user.id,
    )
    db.update_user_profile(user.id, avatar_url=url)
    return AvatarUploadResponse(avatar_url=url)


@router.post("/change-password", response_model=EmailActionResponse)
async def change_password(
    req: ChangePasswordRequest,
    user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> EmailActionResponse:
    """Change user password after validating current password."""
    user_row = db.get_user_by_id(user.id)
    if not user_row or not verify_password(req.current_password, user_row["hashed_password"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    new_hashed = hash_password(req.new_password)
    db.update_user_password(user.id, new_hashed)
    return EmailActionResponse(
        success=True,
        message="Password updated successfully.",
        email=user.email,
    )


@router.post("/claim-daily", response_model=UserCreditsResponse)
async def claim_daily(
    user: UserResponse = Depends(get_current_user),
    credits_svc: CreditService = Depends(get_credit_service),
) -> UserCreditsResponse:
    """Claim daily energy recharge (refills up to 100 credits every 24h)."""
    try:
        return credits_svc.claim_daily_allowance(user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/credits", response_model=UserCreditsResponse)
async def get_credits(
    user: UserResponse = Depends(get_current_user),
    credits_svc: CreditService = Depends(get_credit_service),
) -> UserCreditsResponse:
    """Check current credit balance, daily allowance, and time until next reset."""
    return credits_svc.get_user_credits(user.id)


@router.get("/keys", response_model=list[ApiKeyListItem])
async def list_api_keys(
    user: UserResponse = Depends(get_current_user),
    provider: AuthProvider = Depends(get_auth_provider),
) -> list[ApiKeyListItem]:
    """List active API keys for the current user."""
    return provider.list_api_keys(user.id)


@router.post("/keys", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    req: ApiKeyCreateRequest,
    user: UserResponse = Depends(get_current_user),
    provider: AuthProvider = Depends(get_auth_provider),
) -> ApiKeyResponse:
    """Create a new API key. The raw key is returned once in the response."""
    resp, _ = provider.create_api_key(user.id, req.name)
    return resp


@router.delete("/keys/{key_id}")
async def delete_api_key(
    key_id: str,
    user: UserResponse = Depends(get_current_user),
    provider: AuthProvider = Depends(get_auth_provider),
) -> dict[str, Any]:
    """Revoke an API key."""
    success = provider.delete_api_key(user.id, key_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    return {"deleted": True, "key_id": key_id}


# --- Email Verification & Password Reset -----------------------------------


@router.post("/forgot-password", response_model=EmailActionResponse)
async def forgot_password(
    req: ForgotPasswordRequest,
    db: Database = Depends(get_db),
    mailer: MailerService = Depends(get_mailer_service),
) -> EmailActionResponse:
    """Request a password reset link and 6-digit code via email."""
    user = db.get_user_by_email(req.email)
    if user:
        token_record = db.create_auth_token(user["id"], token_type="password_reset", expires_in_seconds=86400)
        await mailer.send_password_reset_email(
            user["email"], user["username"], token_record["token"], token_record["otp_code"]
        )

    # Always return a generic success message to prevent user email enumeration
    return EmailActionResponse(
        success=True,
        message="If this email is registered, password reset instructions and security code have been sent.",
    )


@router.post("/reset-password", response_model=EmailActionResponse)
async def reset_password(
    req: ResetPasswordRequest,
    db: Database = Depends(get_db),
) -> EmailActionResponse:
    """Reset account password using reset token or 6-digit code."""
    token_record = None

    clean_token = (req.token or "").strip()
    clean_otp = (req.otp_code or "").strip()

    if clean_token:
        token_record = db.get_auth_token(clean_token, token_type="password_reset")

    if not token_record and clean_otp:
        if req.email:
            user = db.get_user_by_email(req.email)
            if user:
                token_record = db.get_auth_token_by_otp(user["id"], clean_otp, token_type="password_reset")
        if not token_record:
            token_record = db.get_auth_token(clean_otp, token_type="password_reset")

    if not token_record or _is_expired(token_record["expires_at"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_OR_EXPIRED_RESET_TOKEN",
        )

    # Update password and mark token used
    new_hashed = hash_password(req.new_password)
    db.update_user_password(token_record["user_id"], new_hashed)
    db.mark_auth_token_used(token_record["id"])

    return EmailActionResponse(
        success=True,
        message="Password has been successfully updated. You can now log in.",
    )


@router.post("/verify-email", response_model=EmailActionResponse)
async def verify_email_post(
    req: VerifyEmailRequest,
    db: Database = Depends(get_db),
) -> EmailActionResponse:
    """Verify email using URL token or 6-digit code."""
    token_record = None

    clean_token = (req.token or "").strip()
    clean_otp = (req.otp_code or "").strip()

    if clean_token:
        token_record = db.get_auth_token(clean_token, token_type="email_verification")

    if not token_record and clean_otp:
        if req.email:
            user = db.get_user_by_email(req.email)
            if user:
                token_record = db.get_auth_token_by_otp(user["id"], clean_otp, token_type="email_verification")
        if not token_record:
            token_record = db.get_auth_token(clean_otp, token_type="email_verification")

    if not token_record or _is_expired(token_record["expires_at"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_OR_EXPIRED_VERIFICATION_TOKEN",
        )

    db.verify_user(token_record["user_id"])
    db.mark_auth_token_used(token_record["id"])

    return EmailActionResponse(
        success=True,
        message="Email successfully verified.",
    )


@router.get("/verify-email", response_model=EmailActionResponse)
async def verify_email_get(
    token: str = Query(..., min_length=1),
    db: Database = Depends(get_db),
) -> EmailActionResponse:
    """Verify email via direct link click with ?token=... query parameter."""
    token_record = db.get_auth_token(token, token_type="email_verification")
    if not token_record or _is_expired(token_record["expires_at"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_OR_EXPIRED_VERIFICATION_TOKEN",
        )

    db.verify_user(token_record["user_id"])
    db.mark_auth_token_used(token_record["id"])

    return EmailActionResponse(
        success=True,
        message="Email successfully verified.",
    )


@router.post("/resend-verification", response_model=EmailActionResponse)
async def resend_verification(
    req: ResendVerificationRequest,
    db: Database = Depends(get_db),
    mailer: MailerService = Depends(get_mailer_service),
) -> EmailActionResponse:
    """Resend email verification link and code for an unverified account."""
    user = db.get_user_by_email(req.email)
    if user and not user.get("is_verified"):
        token_record = db.create_auth_token(user["id"], token_type="email_verification", expires_in_seconds=86400)
        await mailer.send_verification_email(
            user["email"], user["username"], token_record["token"], token_record["otp_code"]
        )

    return EmailActionResponse(
        success=True,
        message="If this account is unverified, a new verification email and code has been sent.",
    )
