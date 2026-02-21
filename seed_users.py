from app.db import SessionLocal, engine
from app.database.models import Users
from app.db import Base


def seed_users():
    db = SessionLocal()

    users = [
        Users(
            username="admin",
            password="admin123",
            role="admin"
        ),
        Users(
            username="operator",
            password="operator123",
            role="operator"
        ),
        Users(
            username="viewer",
            password="viewer123",
            role="viewer"
        ),
    ]

    db.add_all(users)
    db.commit()
    db.close()

    print("✅ Usuarios creados correctamente")


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_users()