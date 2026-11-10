from sqlalchemy import text

from database import SessionLocal


with SessionLocal() as session:
    result = session.execute(text("SELECT 1"))
    print(f"Session working: {result.scalar()}")