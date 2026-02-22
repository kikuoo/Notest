from app import app, db
from app import User
from datetime import datetime, timedelta
import sqlalchemy as sa

def migrate():
    with app.app_context():
        engine = db.engine
        with engine.begin() as conn: # Transaction context
            queries = [
                "ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255);",
                "ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255);",
                "ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'trialing';",
                "ALTER TABLE users ADD COLUMN trial_end DATETIME;",
                "ALTER TABLE users ADD COLUMN current_period_end DATETIME;",
                "ALTER TABLE users ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE;"
            ]
            for query in queries:
                try:
                    conn.execute(sa.text(query))
                    print(f"Executed: {query}")
                except Exception as e:
                    print(f"Skipped {query} - column might already exist. Error: {e}")
        
        print("Checking existing users...")
        users = User.query.all()
        for user in users:
            if not user.trial_end:
                user.trial_end = datetime.utcnow() + timedelta(days=30)
                user.subscription_status = 'trialing'
                print(f"Set trial for user {user.email}")
        
        db.session.commit()
        print("Migration complete!")

if __name__ == "__main__":
    migrate()
