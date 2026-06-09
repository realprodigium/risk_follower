from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import models, schemas
from app.db import get_db
from app.services import auth_services
from app.services.incident_service import incident_service
import logging

router = APIRouter(prefix="/incidents", tags=["incidents"])
logger = logging.getLogger(__name__)

def _audit(db: Session, username: str, action: str, detail: str = None):
    db.add(models.AuditLog(username=username, action=action, detail=detail))
    db.commit()

@router.get("/kpis", response_model=schemas.IncidentKPIs)
def get_kpis(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
):
    return incident_service.get_kpis(db)

@router.get("/", response_model=List[schemas.IncidentResponse])
def list_incidents(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
    status: Optional[str] = Query(None, description="open | acknowledged | resolved"),
    hardware: Optional[str] = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    return incident_service.list_incidents(db, status=status, hardware=hardware, limit=limit, offset=offset)

@router.get("/{incident_id}", response_model=schemas.IncidentResponse)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident

@router.put("/{incident_id}/acknowledge", response_model=schemas.IncidentResponse)
def acknowledge_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
):
    incident = incident_service.acknowledge(db, incident_id, current_user.username)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    _audit(db, current_user.username, "INCIDENT_ACKNOWLEDGE", f"Incident #{incident_id}")
    return incident

@router.put("/{incident_id}/resolve", response_model=schemas.IncidentResponse)
def resolve_incident(
    incident_id: int,
    data: schemas.IncidentResolve,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
):
    incident = incident_service.resolve(db, incident_id, current_user.username, data.resolution_note)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    _audit(db, current_user.username, "INCIDENT_RESOLVE",
           f"Incident #{incident_id} — {data.resolution_note[:80]}")
    return incident
