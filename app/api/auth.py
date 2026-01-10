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


@router.post('/token', response_model=schemas.Token, tags=['auth'])
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db:Session = Depends(get_db)):
    user = auth_services.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Incorrect username or password',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    access_token_expire = timedelta(minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES')))
    access_token = auth_services.create_access_token(
        data={'sub': user.username}, expires_delta=access_token_expire
    )
    return schemas.Token(access_token=access_token, token_type='bearer')
    
@router.post('/register', response_model=schemas.User, tags=['auth'])
def register_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db)):
    
    db_user = db.query(models.Users).filter(models.Users.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth_services.get_password_hash(user.password)
    new_user = models.Users(
        username=user.username,
        password=hashed_password,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.get('/me', response_model=schemas.User, tags=['auth'])
async def read_users_me(
    current_user: Annotated[models.Users, Depends(auth_services.get_current_user)]):
    return current_user