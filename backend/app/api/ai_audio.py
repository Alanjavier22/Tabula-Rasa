from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import google.genai as genai
import os
import base64
import json
import re
from database import get_db
from app.models.category import Category

router = APIRouter(prefix="/ai", tags=["ai"], redirect_slashes=False)


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
    category_id: Optional[str] = Field(None, description="Suggested category ID (null if uncertain)")
    transaction_type: str = Field(..., description="Transaction type: 'income' or 'expense'")


class AudioToTransactionsResponse(BaseModel):
    transactions: List[TransactionSuggestion]
    raw_transcript: Optional[str] = Field(None, description="Raw transcript of the audio")


class BatchCategoryMappingRequest(BaseModel):
    descriptions: List[str] = Field(..., description="List of transaction descriptions to categorize")


class BatchCategoryMappingResponse(BaseModel):
    mapping: Dict[str, int] = Field(..., description="Mapping of description to category_id")


@router.post("/audio-to-txns", response_model=AudioToTransactionsResponse)
async def audio_to_transactions(audio_data: dict):
    """
    Convert audio input to structured transaction suggestions using Gemini AI.
    
    Expected input format:
    {
        "audio_base64": "base64_encoded_audio_data",
        "audio_format": "webm|wav|mp3|ogg"  (optional, defaults to webm)
    }
    """
    try:
        # Extract audio data
        audio_base64 = audio_data.get("audio_base64")
        if not audio_base64:
            raise HTTPException(status_code=400, detail="audio_base64 is required")
        
        audio_format = audio_data.get("audio_format", "webm")
        
        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)
        
        # Configure Gemini API
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")
        
        genai.configure(api_key=api_key)
        client = genai.Client(api_key=api_key)
        
        # Prepare prompt
        prompt = """You are a financial transaction parser. Convert the spoken input into structured transaction data.

Rules:
- Extract all transactions mentioned in the audio
- Amount should be a positive number
- transaction_type must be either "income" or "expense"
- category_id should be null if you're uncertain about the category
- description should be clear and concise in Spanish
- If no transactions are found, return an empty array
- IGNORE any names of persons, addresses, phone numbers, emails, or other personal identity information. Your ONLY task is to extract amounts, categories, and dates.

Return ONLY the JSON response matching the schema."""
        
        # Generate content with audio
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                prompt,
                genai.types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=f"audio/{audio_format}"
                )
            ],
            config=genai.GenerateContentConfig(
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
                                    "category_id": {"type": "number", "nullable": True},
                                    "transaction_type": {"type": "string", "enum": ["income", "expense"]}
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
        result = json.loads(response.text)
        
        # Validate and convert to Pydantic model
        transactions_data = []
        for txn in result.get("transactions", []):
            transactions_data.append(TransactionSuggestion(
                amount=txn["amount"],
                description=txn["description"],
                category_id=txn.get("category_id"),
                transaction_type=txn["transaction_type"]
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
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")


@router.post("/document-to-txns", response_model=AudioToTransactionsResponse)
async def document_to_transactions(document_data: dict):
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
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")
        
        genai.configure(api_key=api_key)
        client = genai.Client(api_key=api_key)
        
        # Prepare prompt for document analysis
        prompt = """You are a financial document parser. Extract all transactions from the invoice, receipt, or bank statement.

Rules:
- Extract ALL individual line items/transactions from the document
- Amount should be a positive number (ignore negative signs, determine type from context)
- transaction_type must be either "income" or "expense" based on context
- category_id should be null if you're uncertain about the category
- description should be clear and concise in Spanish, matching the document text
- Include dates if visible in the document
- If no transactions are found, return an empty array
- For receipts: extract each item purchased
- For bank statements: extract each transaction line
- IGNORE any names of persons, addresses, phone numbers, emails, or other personal identity information. Your ONLY task is to extract amounts, categories, and dates.

Return ONLY the JSON response matching the schema."""
        
        # Generate content with document (vision)
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                prompt,
                genai.types.Part.from_bytes(
                    data=document_bytes,
                    mime_type=document_type
                )
            ],
            config=genai.GenerateContentConfig(
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
                                    "category_id": {"type": "number", "nullable": True},
                                    "transaction_type": {"type": "string", "enum": ["income", "expense"]}
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
        result = json.loads(response.text)
        
        # Validate and convert to Pydantic model
        transactions_data = []
        for txn in result.get("transactions", []):
            transactions_data.append(TransactionSuggestion(
                amount=txn["amount"],
                description=txn["description"],
                category_id=txn.get("category_id"),
                transaction_type=txn["transaction_type"]
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
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")
        
        genai.configure(api_key=api_key)
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
- Use the category ID (number), not the name
- If uncertain, choose the closest match
- Only include descriptions from the input list
- If a description doesn't match any category well, map it to the most generic category available

Return ONLY the JSON response matching the schema: {{"mapping": {{"description": category_id}}}}"""
        
        # Generate content
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt,
            config=genai.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "mapping": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "number"
                            }
                        }
                    },
                    "required": ["mapping"]
                }
            )
        )
        
        # Parse response
        result = json.loads(response.text)
        mapping = result.get("mapping", {})
        
        # Validate category IDs exist
        valid_category_ids = {cat.id for cat in categories}
        validated_mapping = {}
        for desc, cat_id in mapping.items():
            if cat_id in valid_category_ids:
                validated_mapping[desc] = cat_id
        
        return BatchCategoryMappingResponse(mapping=validated_mapping)
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in batch categorization: {str(e)}")
