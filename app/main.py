from fastapi import FastAPI, HTTPException, Depends
from app.db import get_db, Base, engine
from sqlalchemy.orm import Session
from app.database import models
from app.database import schemas


Base.metadata.create_all(bind=engine)
app = FastAPI(title="CO2 Monitoring Backend")

@app.get("/")
def home():
    return {"message": "Backend is running"}

@app.get('/records/', response_model=schemas.Record)
async def read_records(record: schemas.Record, db:Session=Depends(get_db)):
    db_record = db.query(models.Records).filter(models.Records.timestamp == record.timestamp).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Record not found")
    return db_record

@app.post('/records/', response_model=schemas.Record)
async def create_record(record: schemas.RecordCreate, db:Session=Depends(get_db)):
    if db.query(models.Records).filter(models.Records.timestamp == record.timestamp).first():
        raise HTTPException(status_code=400, detail="Record with this timestamp already exists")
    new_record = models.Records(**record.model_dump()) #.dict deprecated
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    return new_record