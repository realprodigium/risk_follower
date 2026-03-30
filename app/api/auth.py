from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Annotated
from app.services import auth_services
from app.database import schemas, models
from app.db import get_db
from sqlalchemy.orm import Session
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

def _write_audit(db: Session, username: str, action: str, detail: str = None):
    entry = models.AuditLog(username=username, action=action, detail=detail)
    db.add(entry)
    db.commit()

@router.post('/token', response_model=schemas.Token, tags=['auth'])
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    user = auth_services.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        _write_audit(db, form_data.username, "LOGIN_FAILED", "Invalid credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Incorrect username or password',
            headers={'WWW-Authenticate': 'Bearer'},
        )

    expire = timedelta(minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES')))
    access_token = auth_services.create_access_token(
        data={'sub': user.username, 'role': user.role},
        expires_delta=expire
    )
    _write_audit(db, user.username, "LOGIN", f"Role: {user.role}")
    return schemas.Token(access_token=access_token, token_type='bearer')

@router.post('/register', response_model=schemas.User, tags=['auth'])
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.Users).filter(models.Users.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = auth_services.get_password_hash(user.password)
    new_user = models.Users(username=user.username, password=hashed, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get('/me', response_model=schemas.User, tags=['auth'])
async def read_users_me(
    current_user: Annotated[models.Users, Depends(auth_services.get_current_user)]
):
    return current_user