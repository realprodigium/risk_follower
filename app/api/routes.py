from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from fastapi.responses import StreamingResponse
import io
import xlsxwriter
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database import models, schemas
from app.db import get_db
from app.services import auth_services
from app.services.record_service import record_service
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

def _audit(db: Session, username: str, action: str, detail: str = None):
    db.add(models.AuditLog(username=username, action=action, detail=detail))
    db.commit()

@router.get('/records', response_model=List[schemas.Record], tags=['records'])
def read_records(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
    limit: int = Query(default=1000, ge=1, le=5000, description="Max records to return"),
    offset: int = Query(default=0, ge=0, description="Records to skip"),
    hardware: Optional[str] = Query(None, description="Filter by hardware ID"),
    risk: Optional[str] = Query(None, description="Filter by risk: alto | normal | bajo"),
    date_from: Optional[datetime] = Query(None, description="ISO datetime lower bound (inclusive)"),
    date_to: Optional[datetime] = Query(None, description="ISO datetime upper bound (inclusive)"),
):
    records = record_service.get_records(
        db=db,
        limit=limit,
        offset=offset,
        hardware=hardware,
        risk=risk,
        date_from=date_from,
        date_to=date_to,
    )
    if not records:
        raise HTTPException(status_code=404, detail="No records found")
    
    logger.info(f"User {current_user.username} fetched {len(records)} records")
    return records

@router.get('/records/latest', response_model=List[schemas.Record], tags=['records'])
def get_latest_records(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
    hardware: Optional[str] = Query(None, description="Filter by specific hardware"),
    limit: int = Query(default=50, ge=1, le=500, description="Number of latest records"),
):
    records = record_service.get_latest_records(db=db, hardware=hardware, limit=limit)
    if not records:
        raise HTTPException(status_code=404, detail="No records found")
    return records

@router.get('/records/{record_id}', response_model=schemas.Record, tags=['records'])
def get_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
):
    record = record_service.get_record_by_id(db=db, record_id=record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.get('/hardware-devices', response_model=List[str], tags=['records'])
def list_hardware_devices(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
):
    devices = record_service.get_hardware_devices(db=db)
    return devices


@router.get('/records/stats/summary', tags=['records', 'statistics'])
def get_statistics(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
    hardware: Optional[str] = Query(None, description="Filter statistics by hardware"),
):
    stats = record_service.get_statistics(db=db, hardware=hardware)
    return stats



@router.post('/records', response_model=schemas.Record, tags=['records'])
def create_record(
    record: schemas.RecordCreate,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin']))
):
    existing = db.query(models.Records).filter(
        models.Records.timestamp == record.timestamp,
        models.Records.hardware == record.hardware
    ).first()
    
    if existing:
        logger.warning(f"Duplicate record attempt: {record.timestamp} on {record.hardware}")
        raise HTTPException(status_code=409, detail="Record with this timestamp and hardware already exists")

    new_record = models.Records(**record.model_dump())
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    
    _audit(db, current_user.username, "CREATE_RECORD", 
           f"Record {new_record.id} (hw={new_record.hardware}, co2={new_record.co2})")
    logger.info(f"Record {new_record.id} created by {current_user.username}")
    return new_record


@router.delete('/records/{record_id}', tags=['records'])
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.require_role(['admin']))
):
    record = record_service.get_record_by_id(db=db, record_id=record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    success = record_service.delete_record(db=db, record_id=record_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete record")

    _audit(db, current_user.username, "DELETE_RECORD",
           f"Deleted record {record_id} (hw={record.hardware}, co2={record.co2})")
    logger.info(f"Record {record_id} deleted by {current_user.username}")
    
    return {"message": f"Record {record_id} deleted successfully"}


@router.get('/records/export/xlsx', tags=['records'])
def export_records_xlsx(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(auth_services.get_current_user),
    hardware: Optional[str] = Query(None),
    risk: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
):
    records = record_service.get_records(
        db=db,
        limit=100000, #siempre debe haber un limite para exportación
        #comunicarse con el desarrollador para obtener todo el histórico
        hardware=hardware,
        risk=risk,
        date_from=date_from,
        date_to=date_to,
    )
    
    if not records:
        raise HTTPException(status_code=404, detail="No records to export")

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet("Reporte Monitoreo")

    header_fmt = workbook.add_format({
        'bold': True, 
        'bg_color': '#111110', 
        'font_color': '#FFFFFF',
        'border': 1
    })
    date_fmt = workbook.add_format({'num_format': 'dd/mm/yyyy hh:mm:ss'})
    num_fmt = workbook.add_format({'num_format': '#,##0.00'})

    headers = ["ID", "Fecha (UTC)", "Hardware", "Temp (°C)", "Humedad (%)", "CO2 (PPM)", "Estado"]
    for col, header in enumerate(headers):
        worksheet.write(0, col, header, header_fmt)

    for row, r in enumerate(records, start=1):
        worksheet.write(row, 0, r.id)
        ts = r.timestamp
        if hasattr(ts, 'replace'):
            ts = ts.replace(tzinfo=None) #excel confunde formato de fechas
        worksheet.write_datetime(row, 1, ts, date_fmt)
        worksheet.write(row, 2, r.hardware)
        worksheet.write(row, 3, r.temperature, num_fmt)
        worksheet.write(row, 4, r.humidity, num_fmt)
        worksheet.write(row, 5, r.co2, num_fmt)
        worksheet.write(row, 6, r.risk.upper())

    worksheet.set_column('A:A', 8)
    worksheet.set_column('B:B', 20)
    worksheet.set_column('C:C', 15)
    worksheet.set_column('D:F', 12)
    worksheet.set_column('G:G', 15)

    workbook.close()
    output.seek(0)

    filename = f"reporte_monitoreo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    _audit(db, current_user.username, "EXPORT_XLSX", f"Exported {len(records)} records")

    return StreamingResponse(
        output,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )