from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Annotated
from datetime import datetime, timezone, timedelta
from app.database import models, schemas
from app.db import get_db
from app.services import auth_services
import os, time

_START_TIME = time.time()

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[models.Users, Depends(auth_services.require_role(['admin']))]

def _audit(db: Session, username: str, action: str, detail: str = None):
    db.add(models.AuditLog(username=username, action=action, detail=detail))
    db.commit()

@router.get("/stats", response_model=schemas.SystemStats)
def get_stats(db: Session = Depends(get_db), admin: AdminUser = None):
    today = datetime.now(timezone.utc).date()
    return schemas.SystemStats(
        total_records=db.query(models.Records).count(),
        total_users=db.query(models.Users).count(),
        active_devices=db.query(models.Records.hardware).distinct().count(),
        alarms_count=db.query(models.Records).filter(models.Records.risk != 'normal').count(),
        records_today=db.query(models.Records).filter(
            func.date(models.Records.timestamp) == today
        ).count(),
    )

@router.get("/users", response_model=List[schemas.User])
def list_users(db: Session = Depends(get_db), admin: AdminUser = None):
    return db.query(models.Users).order_by(models.Users.created_at).all()

@router.post("/users", response_model=schemas.User, status_code=201)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    if db.query(models.Users).filter(models.Users.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = auth_services.get_password_hash(user.password)
    new_user = models.Users(username=user.username, password=hashed, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    _audit(db, admin.username, "CREATE_USER",
           f"Created '{user.username}' with role '{user.role}'")
    return new_user

@router.patch("/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account here")

    changes = []
    if update.role is not None:
        changes.append(f"role: {user.role} → {update.role}")
        user.role = update.role
    if update.password is not None:
        user.password = auth_services.get_password_hash(update.password)
        changes.append("password reset")

    db.commit()
    db.refresh(user)
    _audit(db, admin.username, "UPDATE_USER",
           f"Updated '{user.username}': {', '.join(changes) or 'no changes'}")
    return user

@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    username = user.username
    db.delete(user)
    db.commit()
    _audit(db, admin.username, "DELETE_USER", f"Deleted '{username}'")
    
@router.get("/thresholds", response_model=schemas.AlertThresholdsResponse)
def get_thresholds(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user)
):
    t = db.query(models.AlertThresholds).first()
    if not t:
        t = models.AlertThresholds()
        db.add(t)
        db.commit()
        db.refresh(t)
    return t

@router.put("/thresholds", response_model=schemas.AlertThresholdsResponse)
def update_thresholds(
    data:  schemas.AlertThresholdsSchema,
    db:    Session = Depends(get_db),
    admin: AdminUser = None
):
    t = db.query(models.AlertThresholds).first()
    if not t:
        t = models.AlertThresholds()
        db.add(t)
    for field, value in data.model_dump().items():
        setattr(t, field, value)
    t.updated_by = admin.username
    t.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(t)
    _audit(db, admin.username, "UPDATE_THRESHOLDS", str(data.model_dump()))
    return t

@router.get("/audit", response_model=List[schemas.AuditLogEntry])
def get_audit_log(
    limit: int = 150,
    db: Session = Depends(get_db),
    admin: AdminUser = None
):
    return (db.query(models.AuditLog)
        .order_by(models.AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/analytics", response_model=schemas.AnalyticsSummary)
def get_analytics(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
    hardware: str = None,
    hours: int = 24,
):
    """Return statistical summary for the last N hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    q = db.query(models.Records).filter(models.Records.timestamp >= since)
    if hardware:
        q = q.filter(models.Records.hardware == hardware)
    records = q.all()

    if not records:
        empty = schemas.SensorStats(avg=0, min_val=0, max_val=0, p95=0, count=0)
        return schemas.AnalyticsSummary(
            co2=empty, temperature=empty, humidity=empty,
            normal_pct=0, warning_pct=0, danger_pct=0, total_records=0
        )

    def _stats(values: list) -> schemas.SensorStats:
        s = sorted(values)
        n = len(s)
        p95_idx = min(int(n * 0.95), n - 1)
        return schemas.SensorStats(
            avg=round(sum(s) / n, 2),
            min_val=round(s[0], 2),
            max_val=round(s[-1], 2),
            p95=round(s[p95_idx], 2),
            count=n,
        )

    co2_vals  = [r.co2         for r in records]
    temp_vals = [r.temperature for r in records]
    hum_vals  = [r.humidity    for r in records]

    total = len(records)
    normal_count  = sum(1 for r in records if r.risk == 'normal')
    warning_count = sum(1 for r in records if r.risk == 'advertencia')
    danger_count  = sum(1 for r in records if r.risk == 'peligro')

    return schemas.AnalyticsSummary(
        co2=_stats(co2_vals),
        temperature=_stats(temp_vals),
        humidity=_stats(hum_vals),
        normal_pct=round(normal_count / total * 100, 1),
        warning_pct=round(warning_count / total * 100, 1),
        danger_pct=round(danger_count / total * 100, 1),
        total_records=total,
    )


@router.get("/analytics/hourly", tags=["admin", "analytics"])
def get_hourly_analytics(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
    hardware: str = None,
    days: int = 7,
):
    """Return per-hour avg CO2 for the last N days (for heatmap/trend chart)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(models.Records).filter(models.Records.timestamp >= since)
    if hardware:
        q = q.filter(models.Records.hardware == hardware)
    records = q.order_by(models.Records.timestamp.asc()).all()

    # Group by date + hour
    buckets: dict[str, list] = {}
    for r in records:
        ts = r.timestamp
        if ts.tzinfo is None:
            from datetime import timezone as tz
            ts = ts.replace(tzinfo=tz.utc)
        key = ts.strftime("%Y-%m-%dT%H:00")
        if key not in buckets:
            buckets[key] = []
        buckets[key].append(r.co2)

    result = [
        {
            "hour": k,
            "avg_co2": round(sum(v) / len(v), 1),
            "max_co2": round(max(v), 1),
            "count": len(v),
        }
        for k, v in sorted(buckets.items())
    ]
    return result


# ---------- Observabilidad / Prometheus-style metrics ----------
@router.get("/metrics", tags=["observability"], response_class=Response)
def prometheus_metrics(
    db: Session = Depends(get_db),
    _: models.Users = Depends(auth_services.get_current_user),
):
    """
    Prometheus-compatible plain-text metrics endpoint.
    Suitable for scraping with Prometheus or Grafana Agent.
    """
    try:
        from app.services.mqtt_client import mqtt_subscriber
        mqtt_ok = 1 if mqtt_subscriber.isconnected else 0
    except Exception:
        mqtt_ok = 0

    uptime_seconds = int(time.time() - _START_TIME)
    total_records  = db.query(models.Records).count()
    alarm_records  = db.query(models.Records).filter(models.Records.risk != 'normal').count()
    danger_records = db.query(models.Records).filter(models.Records.risk == 'peligro').count()
    total_users    = db.query(models.Users).count()
    open_incidents = db.query(models.Incident).filter(models.Incident.status == 'open').count()
    ack_incidents  = db.query(models.Incident).filter(models.Incident.status == 'acknowledged').count()
    res_incidents  = db.query(models.Incident).filter(models.Incident.status == 'resolved').count()

    today = datetime.now(timezone.utc).date()
    records_today = db.query(models.Records).filter(
        func.date(models.Records.timestamp) == today
    ).count()
    incidents_today = db.query(models.Incident).filter(
        func.date(models.Incident.triggered_at) == today
    ).count()

    lines = [
        "# HELP co2monitor_uptime_seconds Application uptime in seconds",
        "# TYPE co2monitor_uptime_seconds gauge",
        f"co2monitor_uptime_seconds {uptime_seconds}",
        "",
        "# HELP co2monitor_mqtt_connected MQTT broker connection status (1=connected)",
        "# TYPE co2monitor_mqtt_connected gauge",
        f"co2monitor_mqtt_connected {mqtt_ok}",
        "",
        "# HELP co2monitor_records_total Total sensor records stored",
        "# TYPE co2monitor_records_total counter",
        f"co2monitor_records_total {total_records}",
        "",
        "# HELP co2monitor_records_today Sensor records received today",
        "# TYPE co2monitor_records_today gauge",
        f"co2monitor_records_today {records_today}",
        "",
        "# HELP co2monitor_alarm_records_total Records with non-normal risk",
        "# TYPE co2monitor_alarm_records_total counter",
        f"co2monitor_alarm_records_total {alarm_records}",
        "",
        "# HELP co2monitor_danger_records_total Records with peligro risk",
        "# TYPE co2monitor_danger_records_total counter",
        f"co2monitor_danger_records_total {danger_records}",
        "",
        "# HELP co2monitor_users_total Total registered users",
        "# TYPE co2monitor_users_total gauge",
        f"co2monitor_users_total {total_users}",
        "",
        "# HELP co2monitor_incidents_open Open incidents awaiting acknowledgement",
        "# TYPE co2monitor_incidents_open gauge",
        f"co2monitor_incidents_open {open_incidents}",
        "",
        "# HELP co2monitor_incidents_acknowledged Acknowledged incidents in resolution",
        "# TYPE co2monitor_incidents_acknowledged gauge",
        f"co2monitor_incidents_acknowledged {ack_incidents}",
        "",
        "# HELP co2monitor_incidents_resolved_total Total resolved incidents",
        "# TYPE co2monitor_incidents_resolved_total counter",
        f"co2monitor_incidents_resolved_total {res_incidents}",
        "",
        "# HELP co2monitor_incidents_today Incidents opened today",
        "# TYPE co2monitor_incidents_today gauge",
        f"co2monitor_incidents_today {incidents_today}",
        "",
    ]
    return Response(content="\n".join(lines), media_type="text/plain; version=0.0.4")