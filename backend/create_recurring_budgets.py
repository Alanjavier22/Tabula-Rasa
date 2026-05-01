from database import SessionLocal
from app.models.budget import Budget

db = SessionLocal()

# Recurring budgets for April 2026
budgets = [
    {'name': 'Google One', 'amount': 22.98, 'month': 4, 'year': 2026},
    {'name': 'Gym', 'amount': 22.50, 'month': 4, 'year': 2026},
    {'name': 'Tuenti', 'amount': 10.00, 'month': 4, 'year': 2026},
    {'name': 'Netflix', 'amount': 6.00, 'month': 4, 'year': 2026},
    {'name': 'Fiboeduc', 'amount': 50.00, 'month': 4, 'year': 2026},
    {'name': 'Laptop Dennis', 'amount': 10.00, 'month': 4, 'year': 2026},
    {'name': 'Deprati', 'amount': 11.63, 'month': 4, 'year': 2026},
    {'name': 'Saludsa', 'amount': 45.19, 'month': 4, 'year': 2026},
]

try:
    for b in budgets:
        # Check if already exists
        existing = db.query(Budget).filter(
            Budget.name == b['name'],
            Budget.month == b['month'],
            Budget.year == b['year']
        ).first()
        
        if existing:
            print(f'{b["name"]}: ya existe, actualizando')
            existing.amount = b['amount']
        else:
            new_budget = Budget(**b)
            db.add(new_budget)
            print(f'{b["name"]}: creado')
    
    db.commit()
    print('\nBudgets creados exitosamente')
    
except Exception as e:
    print(f'Error: {e}')
    db.rollback()
finally:
    db.close()
