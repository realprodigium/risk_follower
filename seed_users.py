from app.db import SessionLocal, engine, Base
from app.database.models import Users
from app.services.auth_services import get_password_hash
from datetime import datetime, timezone

def seed_users():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        if db.query(Users).first():
            print("Users already exist. Skipping seed.")
            return
        
        users = [
            Users(
                username="admin",
                password=get_password_hash("admin123"),
                role="admin"
            ),
            Users(
                username="operator1",
                password=get_password_hash("operator123"),
                role="operator"
            ),
            Users(
                username="viewer1",
                password=get_password_hash("viewer123"),
                role="viewer"
            )
        ]
        
        db.add_all(users)
        db.commit()
        print("Users seeded successfully")
        
        for user in users:
            print(f"  - {user.username} ({user.role})")
            
    except Exception as e:
        db.rollback()
        print(f"Error seeding users: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()