from sqlalchemy.orm import Session
from app.models.budget import Budget
from typing import List, Optional, Any, cast
import logging

logger = logging.getLogger(__name__)

# Default recurring budget items (can be customized per user in the future)
DEFAULT_RECURRING_BUDGETS = [
    {'name': 'Google One', 'amount': 2298},
    {'name': 'Gym', 'amount': 2250},
    {'name': 'Tuenti', 'amount': 1000},
    {'name': 'Netflix', 'amount': 600},
    {'name': 'Fiboeduc', 'amount': 5000},
    {'name': 'Laptop Dennis', 'amount': 1000},
    {'name': 'Deprati', 'amount': 1163},
    {'name': 'Saludsa', 'amount': 4519},
]


def generate_recurring_budgets(
    db: Session,
    month: int,
    year: int,
    delete_previous: bool = True,
    budget_items: Optional[List[dict]] = None
) -> List[Budget]:
    """
    Generate recurring budgets for a specific month and year.
    
    Args:
        db: Database session
        month: Month (1-12)
        year: Year (e.g., 2026)
        delete_previous: If True, deletes budgets from the previous month
        budget_items: Custom budget items (if None, uses DEFAULT_RECURRING_BUDGETS)
        
    Returns:
        List of created/updated Budget objects
        
    Raises:
        ValueError: If month is not between 1 and 12
        ValueError: If year is invalid
        ValueError: If budgets already exist for the specified month/year
    """
    # Validation
    if not 1 <= month <= 12:
        raise ValueError("Month must be between 1 and 12")
    
    if year < 2000 or year > 2100:
        raise ValueError("Year must be between 2000 and 2100")
    
    # Check if budgets already exist for this month/year
    existing_budgets = db.query(Budget).filter(
        Budget.month == month,
        Budget.year == year
    ).all()
    
    if existing_budgets:
        raise ValueError(
            f"Budgets already exist for month {month}, year {year}. "
            "Please delete them first or use a different month/year."
        )
    
    # Delete previous month budgets if requested
    if delete_previous:
        previous_month = month - 1 if month > 1 else 12
        previous_year = year if month > 1 else year - 1
        
        previous_budgets = db.query(Budget).filter(
            Budget.month == previous_month,
            Budget.year == previous_year
        ).all()
        
        for budget in previous_budgets:
            db.delete(budget)
        
        if previous_budgets:
            logger.info(f"Deleted {len(previous_budgets)} budgets from {previous_month}/{previous_year}")
    
    # Use default budget items if not provided
    if budget_items is None:
        budget_items = DEFAULT_RECURRING_BUDGETS
    
    # Create budgets
    created_budgets = []
    for item in budget_items:
        new_budget = Budget(
            name=item['name'],
            amount=cast(Any, item['amount']),
            month=month,
            year=year
        )
        db.add(new_budget)
        created_budgets.append(new_budget)
        logger.info(f"Created budget: {item['name']} - ${item['amount']} for {month}/{year}")
    
    db.commit()
    logger.info(f"Successfully created {len(created_budgets)} budgets for {month}/{year}")
    
    return created_budgets


def update_recurring_budgets(
    db: Session,
    month: int,
    year: int,
    budget_items: Optional[List[dict]] = None
) -> List[Budget]:
    """
    Update existing budgets for a specific month and year.
    Creates new budgets if they don't exist.
    
    Args:
        db: Database session
        month: Month (1-12)
        year: Year (e.g., 2026)
        budget_items: Custom budget items (if None, uses DEFAULT_RECURRING_BUDGETS)
        
    Returns:
        List of created/updated Budget objects
        
    Raises:
        ValueError: If month is not between 1 and 12
        ValueError: If year is invalid
    """
    # Validation
    if not 1 <= month <= 12:
        raise ValueError("Month must be between 1 and 12")
    
    if year < 2000 or year > 2100:
        raise ValueError("Year must be between 2000 and 2100")
    
    # Use default budget items if not provided
    if budget_items is None:
        budget_items = DEFAULT_RECURRING_BUDGETS
    
    # Update or create budgets
    updated_budgets = []
    for item in budget_items:
        existing = db.query(Budget).filter(
            Budget.name == item['name'],
            Budget.month == month,
            Budget.year == year
        ).first()
        
        if existing:
            existing.amount = cast(Any, item['amount'])
            updated_budgets.append(existing)
            logger.info(f"Updated budget: {item['name']} - ${item['amount']} for {month}/{year}")
        else:
            new_budget = Budget(
                name=item['name'],
                amount=cast(Any, item['amount']),
                month=month,
                year=year
            )
            db.add(new_budget)
            updated_budgets.append(new_budget)
            logger.info(f"Created budget: {item['name']} - ${item['amount']} for {month}/{year}")
    
    db.commit()
    logger.info(f"Successfully updated/created {len(updated_budgets)} budgets for {month}/{year}")
    
    return updated_budgets
