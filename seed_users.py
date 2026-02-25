from app.db import SessionLocal, engine, Base
from app.database import models
from app.services.auth_services import get_password_hash


def seed_users():
    db = SessionLocal()

    try:
        if db.query(models.Users).first():
            print("⚠️  Los usuarios ya existen. Saltando seed.")
            return

        users = [
            models.Users(
                username="admin",
                password=get_password_hash("admin123"),
                role="admin"
            ),
            models.Users(
                username="operator",
                password=get_password_hash("operator123"),
                role="operator"
            ),
            models.Users(
                username="viewer",
                password=get_password_hash("viewer123"),
                role="viewer"
            ),
        ]

        db.add_all(users)
        db.commit()
        print("✅ Usuarios creados correctamente")

    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    # Al importar models arriba, Base.metadata ya conoce Records, Predictions y Users
    Base.metadata.create_all(bind=engine)
    print("✅ Tablas creadas (o ya existían)")
    seed_users()