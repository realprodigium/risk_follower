"""
Servicio de acceso a registros de sensores.
Asegura que todos los datos consumidos cumplan con validaciones y formatos.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from app.database import models, schemas

logger = logging.getLogger(__name__)


class RecordService:
    """Capa de servicios para acceso a registros de BD"""

    @staticmethod
    def get_records(
        db: Session,
        limit: int = 1000,
        offset: int = 0,
        hardware: Optional[str] = None,
        risk: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[models.Records]:
        """
        Obtiene registros de la BD con filtros opcionales.
        
        Args:
            db: Sesión de base de datos
            limit: Máximo de registros a retornar (1-5000)
            offset: Registros a saltar
            hardware: Filtrar por ID de hardware
            risk: Filtrar por nivel de riesgo (alto|normal|bajo)
            date_from: Timestamp mínimo (inclusive)
            date_to: Timestamp máximo (inclusive)
            
        Returns:
            Lista de modelos.Records
        """
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
        """Obtiene los últimos N registros, opcionalmente por hardware"""
        query = db.query(models.Records)
        if hardware:
            query = query.filter(models.Records.hardware == hardware.strip())
        return query.order_by(desc(models.Records.timestamp)).limit(limit).all()

    @staticmethod
    def get_record_by_id(db: Session, record_id: int) -> Optional[models.Records]:
        """Obtiene un registro específico por ID"""
        return db.query(models.Records).filter(models.Records.id == record_id).first()

    @staticmethod
    def get_hardware_devices(db: Session) -> List[str]:
        """Obtiene lista única de dispositivos hardware registrados"""
        devices = db.query(models.Records.hardware.distinct()).all()
        return sorted([d[0] for d in devices if d[0]])

    @staticmethod
    def get_statistics(db: Session, hardware: Optional[str] = None) -> dict:
        """
        Obtiene estadísticas de los registros.
        
        Returns:
            Dict con: total_records, avg_temp, avg_humidity, avg_co2, 
                     min_co2, max_co2, latest_timestamp
        """
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
        """Elimina un registro específico"""
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
