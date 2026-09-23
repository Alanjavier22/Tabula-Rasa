from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Annotated, List, Optional, Dict, Any, cast
from app.services.ai_models import MULTIMODAL_MODEL, LITE_MODEL, with_gemini_retry_async
from google.genai import types
import base64
import binascii
import json
import re
import logging
from database import get_db
from app.api.auth import get_current_device
from app.models.category import Category
from app.api.ai_shared import get_gemini_key
from app.services.gemini_gateway import create_gemini_client

router = APIRouter(
    prefix="/api/ai", 
    tags=["AI Audio"],
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)

AI_AUDIO_ERROR_RESPONSES = {
    400: {"description": "Invalid audio or document request."},
    404: {"description": "Category resource not found."},
    413: {"description": "Uploaded payload is too large."},
    500: {"description": "AI audio processing failed."},
}
logger = logging.getLogger(__name__)
MAX_DOCUMENT_BYTES = 12 * 1024 * 1024
MAX_DOCUMENT_BASE64_CHARS = 16_777_216
SUPPORTED_DOCUMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


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
    text = re.sub(r'\b\d{3}-?\d{2}-?\d{4}\b', '[REDACTED_SSN]', text)
    
    # Mask addresses (simple pattern: street + number)
    text = re.sub(r'\b\d+\s+[A-Z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b', '[REDACTED_ADDRESS]', text, flags=re.IGNORECASE)
    
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


@router.post("/document-to-txns", response_model=AudioToTransactionsResponse, responses=AI_AUDIO_ERROR_RESPONSES)
async def document_to_transactions(document_data: dict, db: Annotated[Session, Depends(get_db)]):
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
        if not isinstance(document_base64, str) or len(document_base64) > MAX_DOCUMENT_BASE64_CHARS:
            raise HTTPException(status_code=413, detail="El documento supera el tamaño máximo permitido")
        
        document_type = document_data.get("document_type", "image/jpeg")
        if not isinstance(document_type, str) or document_type not in SUPPORTED_DOCUMENT_TYPES:
            raise HTTPException(status_code=400, detail="Tipo de documento no soportado")
        
        # Decode base64 document
        try:
            document_bytes = base64.b64decode(document_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(status_code=400, detail="document_base64 no es válido") from error
        if len(document_bytes) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="El documento supera el tamaño máximo permitido")
        
        # Configure Gemini API
        api_key = get_gemini_key(db)
        client = create_gemini_client(api_key)

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
        response = await with_gemini_retry_async(lambda: client.models.generate_content(
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
        ))
        
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
        
    except HTTPException:
        raise
    except json.JSONDecodeError as error:
        logger.exception("Gemini returned invalid document JSON")
        raise HTTPException(status_code=500, detail="La IA no devolvió un formato válido.") from error
    except Exception as error:
        logger.exception("Gemini document processing failed")
        raise HTTPException(status_code=500, detail="No se pudo procesar el documento.") from error


@router.post("/batch-category-mapping", response_model=BatchCategoryMappingResponse, responses=AI_AUDIO_ERROR_RESPONSES)
async def batch_category_mapping(
    request: BatchCategoryMappingRequest,
    db: Annotated[Session, Depends(get_db)]
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
        client = create_gemini_client(api_key)
        
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
        response = await with_gemini_retry_async(lambda: client.models.generate_content(
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
        ))
        
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
        
    except HTTPException:
        raise
    except json.JSONDecodeError as error:
        logger.exception("Gemini returned invalid category JSON")
        raise HTTPException(status_code=500, detail="La IA no devolvió un formato válido.") from error
    except Exception as error:
        logger.exception("Gemini batch categorization failed")
        raise HTTPException(status_code=500, detail="No se pudo categorizar el lote.") from error
