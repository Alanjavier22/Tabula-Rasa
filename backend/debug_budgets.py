from database import SessionLocal
from app.models.budget import Budget

db = SessionLocal()

try:
    budgets = db.query(Budget).all()
    print(f'Found {len(budgets)} budgets')
    
    for b in budgets:
        print(f'ID: {b.id}, Name: {b.name}, Amount: {b.amount}')
        print(f'Created at: {b.created_at}')
        print(f'Updated at: {b.updated_at}')
        print(f'Created at type: {type(b.created_at)}')
        print(f'Updated at type: {type(b.updated_at)}')
        
        # Try isoformat
        if b.created_at:
            print(f'Created iso: {b.created_at.isoformat()}')
        if b.updated_at:
            print(f'Updated iso: {b.updated_at.isoformat()}')
        print('---')
        
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
finally:
    db.close()
