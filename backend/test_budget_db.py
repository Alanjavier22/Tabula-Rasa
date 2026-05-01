from database import SessionLocal, engine, Base
from app.models.budget import Budget

# Ensure table exists
Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    # Check if table has data
    existing = db.query(Budget).first()
    print(f'Existing budgets: {existing}')
    
    # Try to create one
    new_budget = Budget(name="Test", amount=100.0, month=4, year=2026)
    db.add(new_budget)
    db.commit()
    print('Budget created successfully')
    
    # Query it back
    result = db.query(Budget).filter(Budget.name == "Test").first()
    print(f'Retrieved: {result.name} - ${result.amount}')
    
except Exception as e:
    print(f'Error: {e}')
finally:
    db.close()
