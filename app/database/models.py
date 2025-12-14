from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime
from datetime import datetime, timezone
from ..db import Base, engine

class Records(Base):
    __tablename__ = 'records'

    id = Column(Integer, primary_key=True, index=True)
    hardware = Column(String(50), nullable=False) 
    timestamp = Column(DateTime, nullable=False)
    temp = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    co2 = Column(Float, nullable=False)
    risk = Column(String(20), nullable=False) #alto, normal, bajo
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))

class Predictions(Base):
    __tablename__ = 'predictions'

    id = Column(Integer, primary_key=True, index=True)
    records_id = Column(Integer, ForeignKey('records.id'), nullable=False)
    prediction = Column(String(20), nullable=False) #futura: alto, normal, bajo
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))

class Users(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc)) #utcnow deprecated
