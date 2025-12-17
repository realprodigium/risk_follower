import os
from pydantic import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):

    secret_key: str = os.getenv("SECRET_KEY")
    
