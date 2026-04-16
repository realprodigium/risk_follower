import logging
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from app.database import models, schemas

logger = logging.getLogger(__name__)


class RecordService:
    @staticmethod
    def get_records(#son los filtros que se aplican a la query
        db: Session,
        limit: int = 1000,
        offset: int = 0,
        hardware: Optional[str] = None,
        risk: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[models.Records]:
        
        query = db.query(models.Records)

        filters = []
        if hardware:
            filters.append(models.Records.hardware == hardware.strip())
        if risk:
            risk = risk.lower().strip()
            if risk in {'alto', 'normal', 'bajo'}:
                filters.append(models.Records.risk == risk)
        if date_from:
            if date_from.tzinfo is None:
                date_from = date_from.replace(tzinfo=timezone.utc)
            filters.append(models.Records.timestamp >= date_from)
        if date_to:
            if date_to.tzinfo is None:
                date_to = date_to.replace(tzinfo=timezone.utc)
            filters.append(models.Records.timestamp <= date_to)

        if filters:
            query = query.filter(and_(*filters))

        records = query.order_by(desc(models.Records.timestamp)).offset(offset).limit(limit).all()
        return records

    @staticmethod
    def get_latest_records(db: Session, hardware: Optional[str] = None, limit: int = 50) -> List[models.Records]:
        query = db.query(models.Records)
        if hardware:
            query = query.filter(models.Records.hardware == hardware.strip())
        return query.order_by(desc(models.Records.timestamp)).limit(limit).all()

    @staticmethod
    def get_record_by_id(db: Session, record_id: int) -> Optional[models.Records]:
        return db.query(models.Records).filter(models.Records.id == record_id).first()

    @staticmethod
    def get_hardware_devices(db: Session) -> List[str]:
        devices = db.query(models.Records.hardware.distinct()).all()
        return sorted([d[0] for d in devices if d[0]])

    @staticmethod
    def get_statistics(db: Session, hardware: Optional[str] = None) -> dict:
        query = db.query(models.Records)
        if hardware:
            query = query.filter(models.Records.hardware == hardware.strip())

        records = query.all()
        if not records:
            return {
                "total_records": 0,
                "avg_temperature": 0,
                "avg_humidity": 0,
                "avg_co2": 0,
                "min_co2": 0,
                "max_co2": 0,
                "latest_timestamp": None,
            }

        temps = [r.temperature for r in records]
        humidities = [r.humidity for r in records]
        co2_values = [r.co2 for r in records]

        return {
            "total_records": len(records),
            "avg_temperature": round(sum(temps) / len(temps), 2) if temps else 0,
            "avg_humidity": round(sum(humidities) / len(humidities), 2) if humidities else 0,
            "avg_co2": round(sum(co2_values) / len(co2_values), 2) if co2_values else 0,
            "min_co2": min(co2_values) if co2_values else 0,
            "max_co2": max(co2_values) if co2_values else 0,
            "latest_timestamp": max(r.timestamp for r in records).isoformat() if records else None,
        }

    @staticmethod
    def delete_record(db: Session, record_id: int) -> bool:
        record = db.query(models.Records).filter(models.Records.id == record_id).first()
        if not record:
            return False

        try:
            db.delete(record)
            db.commit()
            logger.info(f"Record {record_id} deleted")
            return True
        except Exception as exc:
            db.rollback()
            logger.error(f"Error deleting record {record_id}: {exc}")
            return False

record_service = RecordService()
