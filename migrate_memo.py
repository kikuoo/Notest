from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        # Check if column exists
        result = db.session.execute(text("SHOW COLUMNS FROM sections LIKE 'memo'"))
        if result.fetchone():
            print("Column 'memo' already exists.")
        else:
            print("Adding column 'memo'...")
            db.session.execute(text("ALTER TABLE sections ADD COLUMN memo TEXT"))
            db.session.commit()
            print("Column 'memo' added successfully.")
    except Exception as e:
        print(f"Error: {e}")
