from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import models, schemas
from app.db import get_db
from app.services import auth_services
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

def _audit(db: Session, username: str, action: str, detail: str = None):
    db.add(models.AuditLog(username=username, action=action, detail=detail))
    db.commit()

@router.get('/records', response_model=List[schemas.Record], tags=['records'])
def read_records(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user)
):
    records = db.query(models.Records).all()
    if not records:
        raise HTTPException(status_code=404, detail="No records found")
    return records

@router.post('/records', response_model=schemas.Record, tags=['records'])
def create_record(
    record:schemas.RecordCreate,
    db:Session=Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin', 'operator']))
):
    if db.query(models.Records).filter(models.Records.timestamp == record.timestamp).first():
        logger.warning(f"Duplicate record at {record.timestamp}")
        raise HTTPException(status_code=400, detail="Record with this timestamp already exists")

    new_record = models.Records(**record.model_dump())
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    logger.info(f"Record created: {new_record.id} → {new_record.co2} ppm")
    return new_record

@router.delete('/records/{record_id}', tags=['records'])
def delete_record(
    record_id:int,
    db:Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin']))
):
    record = db.query(models.Records).filter(models.Records.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    db.delete(record)
    db.commit()
    _audit(db, current_user.username, "DELETE_RECORD",
           f"Deleted record {record_id} (hw={record.hardware}, co2={record.co2})")
    logger.info(f"Record {record_id} deleted by {current_user.username}")
    return {"message": f"Record {record_id} deleted successfully"}