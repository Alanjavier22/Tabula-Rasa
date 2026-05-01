from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from decimal import Decimal
from database import get_db
from app.models.transaction import Transaction, TransactionType, PaymentMethod, ExpenseType
from app.models.account import Account
from app.services.categorizer import get_semantic_category, detect_duplicates, parse_date
from app.services.balance import apply_transaction_to_balance
from app.services.privacy import mask_description
import google.genai as genai
import os
import json
import csv
import io

router = APIRouter(prefix="/import", tags=["Import"], redirect_slashes=False)


class ImportResponse(BaseModel):
    success: bool
    imported_count: int
    skipped_count: int
    errors: list
    ai_categorized_count: int = 0


@router.post("/csv", response_model=ImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    account_id: str = 1,
    db: Session = Depends(get_db)
):
    """
    Import transactions from CSV file.
    Expected CSV columns: date, description, amount, type (optional), payment_method (optional)
    Auto-categorizes based on keywords, skips duplicates.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    content = await file.read()
    csv_file = io.StringIO(content.decode('utf-8'))
    reader = csv.DictReader(csv_file)
    
    imported_count = 0
    skipped_count = 0
    errors = []
    ai_categorized_count = 0
    
    transactions_to_import = []
    orphan_descriptions = {}
    
    for row in reader:
        try:
            description = row.get('description', '').strip()
            amount_str = row.get('amount', '0').strip()
            date_str = row.get('date', '').strip()
            
            if not description or not amount_str or not date_str:
                skipped_count += 1
                errors.append(f"Missing required fields: {row}")
                continue
            
            # Parse amount as int centavos (safe Decimal conversion to avoid IEEE 754 precision loss)
            try:
                cleaned = amount_str.replace(',', '').replace('$', '')
                amount = int(Decimal(str(cleaned)) * 100)
            except (ValueError, TypeError):
                skipped_count += 1
                errors.append(f"Invalid amount: {amount_str}")
                continue
            
            date = parse_date(date_str)
            
            if detect_duplicates(description, amount, date, db):
                skipped_count += 1
                continue
            
            txn_type_str = row.get('type', '').strip().lower()
            if txn_type_str == 'income' or amount < 0:
                txn_type = TransactionType.INCOME
                if amount < 0:
                    amount = abs(amount)
            else:
                txn_type = TransactionType.EXPENSE
            
            payment_method_str = row.get('payment_method', '').strip().lower()
            payment_method_map = {
                'cash': PaymentMethod.CASH,
                'credit_card': PaymentMethod.CREDIT_CARD,
                'debit_card': PaymentMethod.DEBIT_CARD,
                'transfer': PaymentMethod.TRANSFER,
            }
            payment_method = payment_method_map.get(payment_method_str, PaymentMethod.TRANSFER)
            
            category_id = get_semantic_category(description, amount, db)
            
            if category_id is None:
                orphan_descriptions[description] = len(transactions_to_import)
            
            transactions_to_import.append({
                'description': description,
                'amount': amount,
                'transaction_type': txn_type,
                'payment_method': payment_method,
                'date': date,
                'category_id': category_id,
            })
            
        except Exception as e:
            skipped_count += 1
            errors.append(f"Error processing row: {str(e)}")
            continue
    
    # Batch AI categorization for orphans
    if orphan_descriptions:
        try:
            api_key = os.getenv("GOOGLE_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                
                from app.models.category import Category
                categories = db.query(Category).all()
                category_list = "\n".join([f"{cat.id}: {cat.name}" for cat in categories])
                
                # Sanitize descriptions for PII protection
                descriptions_list = "\n".join([f"- {mask_description(desc)}" for desc in orphan_descriptions.keys()])
                
                prompt = f"""You are a financial transaction categorizer. Map each transaction description to the most appropriate category ID.

Available categories:
{category_list}

Transaction descriptions to categorize:
{descriptions_list}

Rules:
- Return a JSON object with the exact description as key and the category ID as value
- Use the category ID (number), not the name
- If uncertain, choose the closest match
- Only include descriptions from the input list
- If a description doesn't match any category well, map it to the most generic category available

Return ONLY the JSON response: {{"description": category_id}}"""
                
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model="gemini-2.0-flash-exp",
                    contents=prompt
                )
                result = json.loads(response.text)
                
                valid_category_ids = {cat.id for cat in categories}
                for desc, cat_id in result.items():
                    if desc in orphan_descriptions and cat_id in valid_category_ids:
                        idx = orphan_descriptions[desc]
                        transactions_to_import[idx]['category_id'] = cat_id
                        ai_categorized_count += 1
                        
        except Exception as e:
            errors.append(f"Batch AI categorization failed: {str(e)}")
    
    # Second pass: import all transactions
    for txn_data in transactions_to_import:
        try:
            txn = Transaction(
                description=txn_data['description'],
                amount=txn_data['amount'],
                transaction_type=txn_data['transaction_type'],
                payment_method=txn_data['payment_method'],
                date=txn_data['date'],
                account_id=account_id,
                category_id=txn_data['category_id'],
                expense_type=ExpenseType.VARIABLE if txn_data['transaction_type'] == TransactionType.EXPENSE else None,
            )
            
            db.add(txn)
            db.flush()
            apply_transaction_to_balance(db, txn, reverse=False)
            imported_count += 1
            
        except Exception as e:
            skipped_count += 1
            errors.append(f"Error importing transaction: {str(e)}")
            continue
    
    db.commit()
    
    return ImportResponse(
        success=imported_count > 0,
        imported_count=imported_count,
        skipped_count=skipped_count,
        errors=errors,
        ai_categorized_count=ai_categorized_count
    )
