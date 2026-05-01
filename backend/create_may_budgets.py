from database import SessionLocal
from app.models.budget import Budget

db = SessionLocal()

try:
    # Delete April budgets
    april_budgets = db.query(Budget).filter(Budget.month == 4, Budget.year == 2026).all()
    for b in april_budgets:
        db.delete(b)
    print(f'Eliminados {len(april_budgets)} budgets de abril')
    
    # Create May budgets
    budgets = [
        {'name': 'Google One', 'amount': 22.98, 'month': 5, 'year': 2026},
        {'name': 'Gym', 'amount': 22.50, 'month': 5, 'year': 2026},
        {'name': 'Tuenti', 'amount': 10.00, 'month': 5, 'year': 2026},
        {'name': 'Netflix', 'amount': 6.00, 'month': 5, 'year': 2026},
        {'name': 'Fiboeduc', 'amount': 50.00, 'month': 5, 'year': 2026},
        {'name': 'Laptop Dennis', 'amount': 10.00, 'month': 5, 'year': 2026},
        {'name': 'Deprati', 'amount': 11.63, 'month': 5, 'year': 2026},
        {'name': 'Saludsa', 'amount': 45.19, 'month': 5, 'year': 2026},
    ]
    
    for b in budgets:
        new_budget = Budget(**b)
        db.add(new_budget)
        print(f'{b["name"]}: creado')
    
    db.commit()
    print(f'\nCreados {len(budgets)} budgets para mayo 2026')
    
except Exception as e:
    print(f'Error: {e}')
    db.rollback()
finally:
    db.close()
