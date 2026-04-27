import logging
import statistics
from datetime import datetime, timezone, timedelta
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

    @staticmethod
    def get_metrics_8h(db: Session, hardware: Optional[str] = None) -> dict:
        """Obtiene métricas de las últimas 8 horas: max/min/avg/volatility para CO2, Temp, Hum y conteo de riesgos"""
        eight_hours_ago = datetime.now(timezone.utc) - timedelta(hours=8)
        
        query = db.query(models.Records).filter(models.Records.timestamp >= eight_hours_ago)
        if hardware:
            query = query.filter(models.Records.hardware == hardware.strip())
        
        records = query.all()
        
        if not records:
            return {
                "period_hours": 8,
                "records_in_period": 0,
                "co2": {"max": 0, "min": 0, "avg": 0, "volatility": 0},
                "temperature": {"max": 0, "min": 0, "avg": 0, "volatility": 0},
                "humidity": {"max": 0, "min": 0, "avg": 0, "volatility": 0},
                "risk_events": 0,
                "warning_events": 0,
                "data_quality": "sin_datos"
            }
        
        co2_vals = [r.co2 for r in records]
        temp_vals = [r.temperature for r in records]
        hum_vals = [r.humidity for r in records]
        risk_count = sum(1 for r in records if r.risk == 'peligro')
        warning_count = sum(1 for r in records if r.risk == 'advertencia')
        
        def calc_volatility(values):
            if len(values) < 2:
                return 0
            return round(statistics.stdev(values), 2)
        
        return {
            "period_hours": 8,
            "records_in_period": len(records),
            "co2": {
                "max": round(max(co2_vals), 1),
                "min": round(min(co2_vals), 1),
                "avg": round(sum(co2_vals) / len(co2_vals), 1),
                "volatility": calc_volatility(co2_vals)
            },
            "temperature": {
                "max": round(max(temp_vals), 1),
                "min": round(min(temp_vals), 1),
                "avg": round(sum(temp_vals) / len(temp_vals), 1),
                "volatility": calc_volatility(temp_vals)
            },
            "humidity": {
                "max": round(max(hum_vals), 1),
                "min": round(min(hum_vals), 1),
                "avg": round(sum(hum_vals) / len(hum_vals), 1),
                "volatility": calc_volatility(hum_vals)
            },
            "risk_events": risk_count,
            "warning_events": warning_count,
            "data_quality": "optima" if len(records) >= 20 else ("buena" if len(records) >= 10 else "limitada")
        }

record_service = RecordService()
