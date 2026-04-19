from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Annotated
from datetime import datetime, timezone
from app.database import models, schemas
from app.db import get_db
from app.services import auth_services

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[models.Users, Depends(auth_services.require_role(['admin']))]

def _audit(db: Session, username: str, action: str, detail: str = None):
    db.add(models.AuditLog(username=username, action=action, detail=detail))
    db.commit()

@router.get("/stats", response_model=schemas.SystemStats)
def get_stats(db: Session = Depends(get_db), admin: AdminUser = None):
    today = datetime.now(timezone.utc).date()
    return schemas.SystemStats(
        total_records=db.query(models.Records).count(),
        total_users=db.query(models.Users).count(),
        active_devices=db.query(models.Records.hardware).distinct().count(),
        alarms_count=db.query(models.Records).filter(models.Records.risk != 'normal').count(),
        records_today=db.query(models.Records).filter(
            func.date(models.Records.timestamp) == today
        ).count(),
    )

@router.get("/users", response_model=List[schemas.User])
def list_users(db: Session = Depends(get_db), admin: AdminUser = None):
    return db.query(models.Users).order_by(models.Users.created_at).all()

@router.post("/users", response_model=schemas.User, status_code=201)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    if db.query(models.Users).filter(models.Users.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = auth_services.get_password_hash(user.password)
    new_user = models.Users(username=user.username, password=hashed, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    _audit(db, admin.username, "CREATE_USER",
           f"Created '{user.username}' with role '{user.role}'")
    return new_user

@router.patch("/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account here")

    changes = []
    if update.role is not None:
        changes.append(f"role: {user.role} → {update.role}")
        user.role = update.role
    if update.password is not None:
        user.password = auth_services.get_password_hash(update.password)
        changes.append("password reset")

    db.commit()
    db.refresh(user)
    _audit(db, admin.username, "UPDATE_USER",
           f"Updated '{user.username}': {', '.join(changes) or 'no changes'}")
    return user

@router.get("/thresholds", response_model=schemas.AlertThresholdsResponse)
def get_thresholds(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user)
):
    t = db.query(models.AlertThresholds).first()
    if not t:
        t = models.AlertThresholds()
        db.add(t)
        db.commit()
        db.refresh(t)
    return t

@router.put("/thresholds", response_model=schemas.AlertThresholdsResponse)
def update_thresholds(
    data:  schemas.AlertThresholdsSchema,
    db:    Session = Depends(get_db),
    admin: AdminUser = None
):
    t = db.query(models.AlertThresholds).first()
    if not t:
        t = models.AlertThresholds()
        db.add(t)
    for field, value in data.model_dump().items():
        setattr(t, field, value)
    t.updated_by = admin.username
    t.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(t)
    _audit(db, admin.username, "UPDATE_THRESHOLDS", str(data.model_dump()))
    return t

@router.get("/audit", response_model=List[schemas.AuditLogEntry])
def get_audit_log(
    limit: int = 150,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    return (db.query(models.AuditLog)
        .order_by(models.AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )