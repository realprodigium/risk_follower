from pydantic import BaseModel, Field
from datetime import datetime

class RecordCreate(BaseModel):
    hardware: str
    timestamp: datetime
    temperature: float
    humidity: float
    co2: float
    risk: str = Field(..., pattern="^(alto|normal|bajo)$")

class Record(RecordCreate):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class PredictionCreate(BaseModel):
    records_id: int
    prediction: str = Field(..., pattern="^(alto|normal|bajo)$")

class Prediction(PredictionCreate):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    role: str = Field(..., pattern="^(admin|operator|viewer)$")

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
    username: str | None = None

