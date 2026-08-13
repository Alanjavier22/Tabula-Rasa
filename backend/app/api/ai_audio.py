from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, cast
import google.genai as genai
from app.services.ai_models import MULTIMODAL_MODEL, LITE_MODEL
from google.genai import errors, types
import os
import base64
import json
import re
from database import get_db
from app.api.auth import get_current_device
from app.models.category import Category

router = APIRouter(
    prefix="/api/ai", 
    tags=["AI Audio"],
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


def sanitize_pii(text: str) -> str:
    """
    Sanitize personally identifiable information (PII) from text before sending to AI.
    Masks names, addresses, phone numbers, emails, and other sensitive data.
    """
    if not text:
        return text
    
    # Mask email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[REDACTED_EMAIL]', text)
    
    # Mask phone numbers (various formats)
    text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[REDACTED_PHONE]', text)
    text = re.sub(r'\b\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '[REDACTED_PHONE]', text)
    
    # Mask potential credit card numbers (16 digits with spaces/dashes)
    text = re.sub(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '[REDACTED_CARD]', text)
    
    # Mask potential SSN-like numbers (9 digits)
    text = re.sub(r'\b\d{3}[-]?\d{2}[-]?\d{4}\b', '[REDACTED_SSN]', text)
    
    # Mask addresses (simple pattern: street + number)
    text = re.sub(r'\b\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b', '[REDACTED_ADDRESS]', text, flags=re.IGNORECASE)
    
    # Mask long sequences of words that look like names (2+ capitalized words in a row)
    text = re.sub(r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b', '[REDACTED_NAME]', text)
    
    return text


# Pydantic schema for structured AI response
class TransactionSuggestion(BaseModel):
    amount: float = Field(..., description="Transaction amount")
    description: str = Field(..., description="Transaction description")
    category_id: Optional[str] = Field(None, description="Suggested category ID (UUID)")
    account_id: Optional[str] = Field(None, description="Suggested account/payment method ID (UUID)")
    transaction_type: str = Field(..., description="Transaction type: 'income' or 'expense'")
    date: Optional[str] = Field(None, description="Transaction date (YYYY-MM-DD)")


class AudioToTransactionsResponse(BaseModel):
    transactions: List[TransactionSuggestion]
    raw_transcript: Optional[str] = Field(None, description="Raw transcript of the audio")


class BatchCategoryMappingRequest(BaseModel):
    descriptions: List[str] = Field(..., description="List of transaction descriptions to categorize")


class BatchCategoryMappingResponse(BaseModel):
    mapping: Dict[str, str] = Field(..., description="Mapping of description to category_id")


def get_gemini_key(db: Session) -> str:
    """Get Gemini API key from config table."""
    from app.models.config import Config
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        raise HTTPException(
            status_code=400,
            detail="IA en mantenimiento. Configura tu Gemini API Key en la página de Configuración."
        )
    return cast(str, config.value)


@router.post("/document-to-txns", response_model=AudioToTransactionsResponse)
async def document_to_transactions(document_data: dict, db: Session = Depends(get_db)):
    """
    Convert document (image/PDF) input to structured transaction suggestions using Gemini Vision AI.
    
    Expected input format:
    {
        "document_base64": "base64_encoded_document_data",
        "document_type": "image/jpeg|image/png|image/webp|application/pdf"
    }
    """
    try:
        # Extract document data
        document_base64 = document_data.get("document_base64")
        if not document_base64:
            raise HTTPException(status_code=400, detail="document_base64 is required")
        
        document_type = document_data.get("document_type", "image/jpeg")
        
        # Decode base64 document
        document_bytes = base64.b64decode(document_base64)
        
        # Configure Gemini API
        api_key = get_gemini_key(db)
        client = genai.Client(api_key=api_key)

        # Fetch context from DB
        from app.models.account import Account
        categories = db.query(Category).filter(Category.is_deleted == False).all()
        accounts = db.query(Account).filter(Account.is_deleted == False, Account.is_active == True).all()
        
        category_context = "\n".join([f"- {cat.id}: {cat.name}" for cat in categories])
        account_context = "\n".join([f"- {acc.id}: {acc.name} ({acc.account_type})" for acc in accounts])

        # Prepare prompt for document analysis
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = f"""You are a financial document parser. Hoy es {today}. 
Extract all transactions from the invoice, receipt, or bank statement.

AVAILABLE CATEGORIES:
{category_context}

AVAILABLE ACCOUNTS (Payment Methods):
{account_context}

Rules:
- Extract ALL individual line items/transactions from the document.
- Amount should be a positive number.
- transaction_type: "income" or "expense" based on context.
- category_id: Map to the closest Category ID.
- account_id: Map to the closest Account ID if mentioned (e.g. card name).
- description: Concise in Spanish.
- date: ISO YYYY-MM-DD from document. Use {today} if missing.
- IGNORE PII.

Return ONLY the JSON response matching the schema."""
        
        # Generate content with document (vision)
        response = client.models.generate_content(
            model=MULTIMODAL_MODEL,
            contents=cast(Any, [
                types.Part.from_text(text=prompt),
                types.Part.from_bytes(
                    data=document_bytes,
                    mime_type=document_type
                )
            ]),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "transactions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "amount": {"type": "number"},
                                    "description": {"type": "string"},
                                    "category_id": {"type": "string", "nullable": True},
                                    "account_id": {"type": "string", "nullable": True},
                                    "transaction_type": {"type": "string", "enum": ["income", "expense"]},
                                    "date": {"type": "string", "nullable": True}
                                },
                                "required": ["amount", "description", "transaction_type"]
                            }
                        },
                        "raw_transcript": {"type": "string", "nullable": True}
                    },
                    "required": ["transactions"]
                }
            )
        )
        
        # Parse response
        result = json.loads(response.text or "{}")
        
        # Validate and convert to Pydantic model
        transactions_data = []
        for txn in result.get("transactions", []):
            transactions_data.append(TransactionSuggestion(
                amount=txn["amount"],
                description=txn["description"],
                category_id=txn.get("category_id"),
                account_id=txn.get("account_id"),
                transaction_type=txn["transaction_type"],
                date=txn.get("date")
            ))
        
        # Sanitize PII from transcript before returning
        raw_transcript = result.get("raw_transcript")
        if raw_transcript:
            raw_transcript = sanitize_pii(raw_transcript)
        
        return AudioToTransactionsResponse(
            transactions=transactions_data,
            raw_transcript=raw_transcript
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.post("/batch-category-mapping", response_model=BatchCategoryMappingResponse)
async def batch_category_mapping(
    request: BatchCategoryMappingRequest,
    db: Session = Depends(get_db)
):
    """
    Batch categorize transaction descriptions using Gemini AI.
    
    This endpoint takes a list of orphan descriptions and returns a mapping
    of description -> category_id in a single API call, saving hundreds of
    individual API calls during CSV import.
    """
    try:
        # Fetch all categories from DB
        categories = db.query(Category).all()
        if not categories:
            raise HTTPException(status_code=404, detail="No categories found in database")
        
        # Prepare category list for AI
        category_list = "\n".join([f"{cat.id}: {cat.name}" for cat in categories])
        
        # Configure Gemini API
        api_key = get_gemini_key(db)
        client = genai.Client(api_key=api_key)
        
        # Prepare prompt
        descriptions_list = "\n".join([f"- {desc}" for desc in request.descriptions])
        prompt = f"""You are a financial transaction categorizer. Map each transaction description to the most appropriate category ID.

Available categories:
{category_list}

Transaction descriptions to categorize:
{descriptions_list}

Rules:
- Return a JSON object with the exact description as key and the category ID as value
- Use the category ID (string/UUID), not the name
- If uncertain, choose the closest match
- Only include descriptions from the input list
- If a description doesn't match any category well, map it to the most generic category available

Return ONLY the JSON response matching the schema: {{"mapping": {{"description": "category_id"}}}}"""
        
        # Generate content
        response = client.models.generate_content(
            model=LITE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "mapping": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "string"
                            }
                        }
                    },
                    "required": ["mapping"]
                }
            )
        )
        
        # Parse response
        result = json.loads(response.text or "{}")
        mapping = result.get("mapping", {})
        
        # Validate category IDs exist
        valid_category_ids = {cat.id for cat in categories}
        validated_mapping = {}
        for desc, cat_id in mapping.items():
            # Support validation in case Gemini sends integer strings
            str_cat_id = str(cat_id)
            if str_cat_id in valid_category_ids:
                validated_mapping[desc] = str_cat_id
        
        return BatchCategoryMappingResponse(mapping=validated_mapping)
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in batch categorization: {str(e)}")
