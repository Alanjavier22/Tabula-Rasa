import os
import json
from typing import Optional
from database import SessionLocal
import google.genai as genai
from pydantic import BaseModel, Field
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType, PaymentMethod, ExpenseType
from app.services.privacy import mask_description


# AI bypass flag for cold load migration
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"


def get_semantic_category(description: str, amount: int, db_session=None) -> Optional[int]:
    """
    Auto-categorize transaction based on semantic meaning of description and amount.
    Uses Gemini with a strict JSON schema and falls back to an 'Otros' category on low confidence.
    Bypasses AI calls during cold load migration (AI_ENABLED=false).
    """
    if not description:
        return None
    
    # Bypass AI during cold load migration
    if not AI_ENABLED:
        db = db_session or SessionLocal()
        try:
            otros_cat = db.query(Category).filter(Category.name == "Otros").first()
            return otros_cat.id if otros_cat else None
        finally:
            if not db_session:
                db.close()
        
    db = db_session or SessionLocal()
    try:
        # 1. Obtain current categories from DB to act as semantic map
        categories = db.query(Category).all()
        if not categories:
            return None
            
        category_map = [{"id": cat.id, "name": cat.name} for cat in categories]
        
        # 2. Check if API Key exists
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            # Fallback to naive keyword if no API key is set, or just return default
            otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
            return otros_cat.id if otros_cat else categories[0].id
            
        genai.configure(api_key=api_key)
        
        # 3. Direct Classification approach vs Embeddings:
        # For a local system with <100 categories, Direct Classification via Prompt 
        # is vastly superior in development speed, requires no vector DB infrastructure,
        # and leverages the extensive pre-trained knowledge of the LLM. 
        # Embeddings would require managing a vector store and fine-tuning thresholds.
        
        system_instruction = (
            "Eres un categorizador financiero estricto. "
            "Se te proporcionará una descripción de transacción y un monto. "
            f"Debes clasificarla en UNA de estas categorías exactas: {json.dumps(category_map)}. "
            "Devuelve estrictamente un JSON con 'category_id' y un 'confidence' entre 0.0 y 1.0. "
            "No inventes IDs."
        )
        
        # Sanitize description to remove PII before sending to AI
        sanitized_description = mask_description(description)
        prompt = f"Descripción: '{sanitized_description}' | Monto: ${amount / 100:.2f}"
        
        model = genai.GenerativeModel(
            "gemini-3.1-flash-lite-preview",
            system_instruction=system_instruction
        )
        
        class CategoryPrediction(BaseModel):
            category_id: str
            confidence: float
            
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=CategoryPrediction
            )
        )
        
        try:
            result = json.loads(response.text)
            pred_id = result.get("category_id")
            confidence = result.get("confidence", 0.0)
            
            # 4. Fallback for low confidence
            if confidence < 0.70:
                otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
                return otros_cat.id if otros_cat else categories[0].id
                
            # Verify the ID actually exists in our list
            if any(c.id == pred_id for c in categories):
                return pred_id
            else:
                otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
                return otros_cat.id if otros_cat else categories[0].id
                
        except json.JSONDecodeError:
            pass
            
        # Absolute fallback
        otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
        return otros_cat.id if otros_cat else categories[0].id
        
    except Exception as e:
        print(f"Error semántico: {e}")
        # Absolute fallback
        otros_cat = next((c for c in categories if c.name.lower() == "otros"), None)
        return otros_cat.id if otros_cat else categories[0].id
        
    finally:
        if not db_session:
            db.close()


def detect_duplicates(description: str, amount: float, date: str, db) -> bool:
    """
    Check if transaction already exists to avoid duplicates.
    Returns True if duplicate found.
    """
    existing = db.query(Transaction).filter(
        Transaction.description == description,
        Transaction.amount == amount,
        Transaction.date == date
    ).first()
    return existing is not None


def parse_date(date_str: str) -> str:
    """
    Parse date string to ISO format.
    Handles multiple formats: DD/MM/YYYY, YYYY-MM-DD, etc.
    """
    from datetime import datetime
    
    # Try common formats
    formats = [
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%m/%d/%Y",
    ]
    
    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.isoformat()
        except ValueError:
            continue
    
    # If all fail, return as-is (hope it's already ISO)
    return date_str
