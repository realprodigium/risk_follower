from fastapi import FastAPI
from .db import get_db

app = FastAPI()


@app.get("/")
def home():
    return {"message": "Backend is running"}