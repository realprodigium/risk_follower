"""
Servicio de gestión de incidentes.
Ciclo de vida: open → acknowledged → resolved
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from app.database import models, schemas

logger = logging.getLogger(__name__)


class IncidentService:

    @staticmethod
    def get_or_create_open(
        db: Session,
        hardware: str,
        risk_level: str,
        co2: float,
        temperature: float,
        humidity: float,
    ) -> tuple[models.Incident, bool]:
        """
        Returns (incident, created).
        If there's already an open/acknowledged incident for this hardware, returns it.
        Otherwise creates a new one.
        """
        existing = (
            db.query(models.Incident)
            .filter(
                models.Incident.hardware == hardware,
                models.Incident.status.in_(["open", "acknowledged"]),
            )
            .order_by(desc(models.Incident.created_at))
            .first()
        )
        if existing:
            # Upgrade risk level if escalates from advertencia → peligro
            if risk_level == "peligro" and existing.risk_level == "advertencia":
                existing.risk_level = risk_level
                existing.co2 = co2
                existing.temperature = temperature
                existing.humidity = humidity
                db.commit()
                db.refresh(existing)
            return existing, False

        new_incident = models.Incident(
            hardware=hardware,
            risk_level=risk_level,
            co2=co2,
            temperature=temperature,
            humidity=humidity,
            status="open",
        )
        db.add(new_incident)
        db.commit()
        db.refresh(new_incident)
        logger.info(f"Incident #{new_incident.id} opened for {hardware} ({risk_level})")
        return new_incident, True

    @staticmethod
    def acknowledge(
        db: Session,
        incident_id: int,
        username: str,
    ) -> Optional[models.Incident]:
        incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
        if not incident:
            return None
        if incident.status != "open":
            return incident  # Already acknowledged or resolved
        incident.status = "acknowledged"
        incident.acknowledged_at = datetime.now(timezone.utc)
        incident.acknowledged_by = username
        db.commit()
        db.refresh(incident)
        logger.info(f"Incident #{incident_id} acknowledged by {username}")
        return incident

    @staticmethod
    def resolve(
        db: Session,
        incident_id: int,
        username: str,
        resolution_note: str,
    ) -> Optional[models.Incident]:
        incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
        if not incident:
            return None
        if incident.status == "resolved":
            return incident
        incident.status = "resolved"
        incident.resolved_at = datetime.now(timezone.utc)
        incident.resolved_by = username
        incident.resolution_note = resolution_note
        db.commit()
        db.refresh(incident)
        logger.info(f"Incident #{incident_id} resolved by {username}")
        return incident

    @staticmethod
    def list_incidents(
        db: Session,
        status: Optional[str] = None,
        hardware: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[models.Incident]:
        q = db.query(models.Incident)
        if status:
            q = q.filter(models.Incident.status == status)
        if hardware:
            q = q.filter(models.Incident.hardware == hardware)
        return q.order_by(desc(models.Incident.created_at)).offset(offset).limit(limit).all()

    @staticmethod
    def get_kpis(db: Session) -> schemas.IncidentKPIs:
        today = datetime.now(timezone.utc).date()

        open_count = db.query(models.Incident).filter(models.Incident.status == "open").count()
        ack_count = db.query(models.Incident).filter(models.Incident.status == "acknowledged").count()
        res_count = db.query(models.Incident).filter(models.Incident.status == "resolved").count()
        total_today = db.query(models.Incident).filter(
            func.date(models.Incident.triggered_at) == today
        ).count()

        # Average response time (open → acknowledged) in minutes
        acked = db.query(models.Incident).filter(
            models.Incident.acknowledged_at.isnot(None),
            models.Incident.triggered_at.isnot(None),
        ).all()
        avg_response = None
        if acked:
            deltas = [
                (i.acknowledged_at - i.triggered_at).total_seconds() / 60
                for i in acked
                if i.acknowledged_at and i.triggered_at
            ]
            avg_response = round(sum(deltas) / len(deltas), 1) if deltas else None

        # Average resolution time (open → resolved) in minutes
        resolved = db.query(models.Incident).filter(
            models.Incident.resolved_at.isnot(None),
            models.Incident.triggered_at.isnot(None),
        ).all()
        avg_resolution = None
        if resolved:
            deltas = [
                (i.resolved_at - i.triggered_at).total_seconds() / 60
                for i in resolved
                if i.resolved_at and i.triggered_at
            ]
            avg_resolution = round(sum(deltas) / len(deltas), 1) if deltas else None

        return schemas.IncidentKPIs(
            open_count=open_count,
            acknowledged_count=ack_count,
            resolved_count=res_count,
            total_today=total_today,
            avg_response_minutes=avg_response,
            avg_resolution_minutes=avg_resolution,
        )

    @staticmethod
    def mark_notification_sent(db: Session, incident_id: int, error: Optional[str] = None):
        incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
        if incident:
            incident.notification_sent = (error is None)
            incident.notification_error = error
            db.commit()


incident_service = IncidentService()
