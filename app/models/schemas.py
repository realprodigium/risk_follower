from pydantic import BaseModel
from datetime import datetime

class Record(BaseModel):
    id: int
    hardware: str
    timestamp: datetime
    temp: float
    humidity: float
    co2: float
    risk: str

class Prediction(BaseModel):
    id: int
    prediction: float
    
class User(BaseModel):
    id: int
    username: str
    password: str
    role: str