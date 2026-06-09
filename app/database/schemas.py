from pydantic import BaseModel, Field, EmailStr
from datetime import datetime
from typing import Optional, List

class RecordCreate(BaseModel):
    hardware:    str
    timestamp:   datetime
    temperature: float
    humidity:    float
    co2:         float
    risk:        str = Field(..., pattern="^(alto|normal|bajo|peligro|advertencia|high|low)$")

class Record(RecordCreate):
    id:         int
    created_at: datetime
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    role: str = Field(..., pattern="^(admin|operator|viewer)$")

class UserUpdate(BaseModel):
    role:Optional[str] = Field(None, pattern="^(admin|operator|viewer)$")
    password: Optional[str] = Field(None, min_length=8)

class User(BaseModel):
    id: int
    username: str
    role: str
    created_at: datetime
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

class AlertThresholdsSchema(BaseModel):
    # Rango normal
    co2_low: float = Field(default=400.0, gt=0)
    co2_high: float = Field(default=1000.0, gt=0)
    temp_low: float = Field(default=15.0)
    temp_high: float = Field(default=30.0)
    humidity_low: float = Field(default=30.0, ge=0, le=100)
    humidity_high: float = Field(default=60.0, ge=0, le=100)
    # Límites de advertencia
    co2_warning: float = Field(default=1500.0, gt=0)
    temp_warning: float = Field(default=35.0)
    humidity_warning: float = Field(default=70.0, ge=0, le=100)

class AlertThresholdsResponse(AlertThresholdsSchema):
    id: int
    updated_at: datetime
    updated_by: Optional[str]
    class Config:
        from_attributes = True

class AuditLogEntry(BaseModel):
    id: int
    timestamp: datetime
    username: str
    action: str
    detail: Optional[str]
    class Config:
        from_attributes = True

class SystemStats(BaseModel):
    total_records: int
    total_users: int
    active_devices: int
    alarms_count: int
    records_today: int

# --- Incidents ---
class IncidentResponse(BaseModel):
    id: int
    hardware: str
    risk_level: str
    triggered_at: datetime
    co2: float
    temperature: float
    humidity: float
    status: str
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_note: Optional[str] = None
    notification_sent: bool
    created_at: datetime
    class Config:
        from_attributes = True

class IncidentAcknowledge(BaseModel):
    pass  # Sólo requiere autenticación, el username viene del token

class IncidentResolve(BaseModel):
    resolution_note: str = Field(..., min_length=10, description="Descripción obligatoria de cómo se resolvió el incidente")

class IncidentKPIs(BaseModel):
    open_count: int
    acknowledged_count: int
    resolved_count: int
    total_today: int
    avg_response_minutes: Optional[float]  # Tiempo medio desde open hasta acknowledged
    avg_resolution_minutes: Optional[float]  # Tiempo medio desde open hasta resolved

# --- Analytics ---
class SensorStats(BaseModel):
    avg: float
    min_val: float
    max_val: float
    p95: float
    count: int

class AnalyticsSummary(BaseModel):
    co2: SensorStats
    temperature: SensorStats
    humidity: SensorStats
    normal_pct: float
    warning_pct: float
    danger_pct: float
    total_records: int