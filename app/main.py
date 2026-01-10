from fastapi import FastAPI, HTTPException, Depends
from app.db import get_db, Base, engine
from sqlalchemy.orm import Session
from app.database import models
from app.database import schemas
from typing import List, Annotated
from app.api import auth
from app.services import auth_services

Base.metadata.create_all(bind=engine)
app = FastAPI(title="CO2 Monitoring Backend")
app.include_router(auth.router)

@app.get("/")
def home():
    return {"message": "Backend is running"}

@app.get('/records', response_model=List[schemas.Record], tags=['records'])
def read_records(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user)):
    
    db_records = db.query(models.Records).all()
    if not db_records:
        raise HTTPException(status_code=404, detail="No records found")
    return db_records

@app.post('/records', response_model=schemas.Record, tags=['records'])
def create_record(
    record: schemas.RecordCreate,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin', 'operator']))):
    
    if db.query(models.Records).filter(models.Records.timestamp == record.timestamp).first():
        raise HTTPException(status_code=400, detail="Record with this timestamp already exists")
    
    new_record = models.Records(**record.model_dump())
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    return new_record

@app.delete('/records/{record_id}', tags=['records'])
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin']))):
    
    record = db.query(models.Records).filter(models.Records.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    db.delete(record)
    db.commit()
    return {"message": f"Record {record_id} deleted successfully"}

@app.get('/predictions', response_model=List[schemas.Prediction], tags=['predictions'])
def read_predictions(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user)):
    
    predictions = db.query(models.Predictions).all()
    if not predictions:
        raise HTTPException(status_code=404, detail="No predictions found")
    return predictions