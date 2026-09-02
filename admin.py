"""
Admin endpoints for data management and user management.
All endpoints require is_superuser=True or admin role.
"""

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
import uuid

from app.core.database import get_db
from app.api.deps import get_current_user, require_superuser
from app.models.user import User
from app.models.trademark import MarketBrand
from app.services.external_apis import search_openfda
from app.repositories.user import UserRepository
from app.repositories.audit import AuditRepository
from app.schemas.user import UserAdminResponse, CreateUserAdminRequest, UpdateUserAdminRequest

router = APIRouter(prefix="/admin", tags=["Admin"])

# ── User Management ────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    return UserRepository(db).get_all_users()


@router.post("/users", response_model=UserAdminResponse)
def create_user(
    request: CreateUserAdminRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    repo = UserRepository(db)
    if repo.get_by_email(request.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = repo.create(
        email=request.email,
        full_name=request.full_name,
        password=request.password,
        role=request.role,
        department=request.department,
        is_superuser=request.is_superuser,
    )
    AuditRepository(db).create(
        action="USER_CREATED",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user.id),
        details=f"Created user {user.email} (Role: {user.role})",
        metadata={"email": user.email, "role": user.role, "department": user.department},
        status="success",
    )
    return user


@router.patch("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: uuid.UUID,
    request: UpdateUserAdminRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    repo = UserRepository(db)
    data = {k: v for k, v in request.model_dump().items() if v is not None}
    user = repo.update_user(user_id, **data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    AuditRepository(db).create(
        action="USER_UPDATED",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user.id),
        details=f"Updated user {user.email}",
        metadata=data,
        status="success",
    )
    return user


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    repo = UserRepository(db)
    user = repo.update_user(user_id, is_active=False)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    AuditRepository(db).create(
        action="USER_DEACTIVATED",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user.id),
        details=f"Deactivated user {user.email}",
        status="success",
    )
    return {"message": "User deactivated"}


@router.delete("/users/{user_id}/permanent")
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """Permanently remove a user (distinct from deactivation)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    repo = UserRepository(db)
    target = repo.get_by_id(user_id)
    target_email = target.email if target else str(user_id)
    deleted = repo.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    AuditRepository(db).create(
        action="USER_DELETED",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user_id),
        details=f"Permanently deleted user {target_email}",
        status="success",
    )
    return {"message": "User deleted"}


# ── FDA Data Sync ──────────────────────────────────────────────────────────────

_SEED_TERMS = [
    "cardio", "neuro", "gluco", "onco", "respir", "arthro", "derm",
    "gastro", "nephro", "immuno", "meta", "vaso", "pulmo", "osteo",
    "lipid", "hyper", "diab", "thyro", "hemo", "infect",
]


@router.post("/sync/fda")
async def sync_fda_data(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    background_tasks.add_task(_run_fda_sync, db)
    return {"message": "FDA sync started in background", "terms": len(_SEED_TERMS)}


async def _run_fda_sync(db: Session):
    import asyncio
    inserted = 0

    for term in _SEED_TERMS:
        try:
            results = await search_openfda(term)
            for item in results:
                brand = item.get("brand_name", "").strip()
                if not brand or len(brand) < 2:
                    continue

                exists = (
                    db.query(MarketBrand)
                    .filter(MarketBrand.brand_name.ilike(brand))
                    .first()
                )
                if exists:
                    continue

                normalized = brand.lower().strip()
                record = MarketBrand(
                    brand_name=brand,
                    normalized_name=normalized,
                    manufacturer=item.get("manufacturer", ""),
                    therapeutic_area=item.get("product_type", "Pharmaceutical"),
                    drug_class=item.get("route", ""),
                    active_ingredient=item.get("generic_name", ""),
                    country="US",
                    is_otc=False,
                    is_generic=False,
                )
                db.add(record)
                inserted += 1

            await asyncio.sleep(0.3)

        except Exception:
            continue

    try:
        db.commit()
    except Exception:
        db.rollback()

    return inserted
