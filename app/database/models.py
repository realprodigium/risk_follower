from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime, timezone
from ..db import Base

class Records(Base):
    __tablename__ = 'records'

    id = Column(Integer, primary_key=True, index=True)
    hardware = Column(String(50), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    co2 = Column(Float, nullable=False)
    risk = Column(String(20), nullable=False)#alto | normal | bajo
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    @staticmethod
    def reset_data(db):
        try:
            db.query(Records).delete()
            db.commit()
            return True
        except Exception:
            db.rollback()
            return False

class Users(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)#admin, operator, viewer
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AlertThresholds(Base):
    __tablename__ = 'alert_thresholds'

    id = Column(Integer, primary_key=True)
    co2_high = Column(Float, default=1000.0, nullable=False)
    co2_low = Column(Float, default=400.0,  nullable=False)
    temp_high = Column(Float, default=35.0,   nullable=False)
    temp_low = Column(Float, default=15.0,   nullable=False)
    humidity_high = Column(Float, default=80.0,   nullable=False)
    humidity_low = Column(Float, default=30.0,   nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(50), nullable=True)

class AuditLog(Base):
    __tablename__ = 'audit_log'

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    username = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    detail = Column(String(500), nullable=True)