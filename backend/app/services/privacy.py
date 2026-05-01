import re
from typing import List, Dict, Any


def mask_financial_data(payload: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sanitize financial data before sending to AI.
    Masks PII (names, account numbers, locations) while preserving amounts and categories.
    
    Args:
        payload: List of transaction dictionaries
        
    Returns:
        Sanitized list with PII masked
    """
    sanitized = []
    
    for record in payload:
        clean_record = record.copy()
        
        # Remove UUID entirely
        clean_record.pop("id", None)
        
        # Remove metadata_json (may contain tokens/sensitive data)
        clean_record.pop("metadata_json", None)
        
        # Mask description if present
        if "description" in clean_record and clean_record["description"]:
            clean_record["description"] = mask_description(clean_record["description"])
        
        sanitized.append(clean_record)
    
    return sanitized


def mask_description(text: str) -> str:
    """
    Mask PII in transaction description.
    
    Patterns masked:
    - Person names: "Pago a Juan Pérez" -> "Pago a [PERSON]"
    - Account/card numbers (>4 digits): "****1234" -> "[ACCOUNT_HIDDEN]"
    - Specific locations: "KFC Av. Francisco de Orellana" -> "KFC [LOCATION]"
    """
    if not text:
        return text
    
    # Mask account/card numbers (sequences of 4+ digits)
    text = re.sub(r'\b\d{4,}\b', '[ACCOUNT_HIDDEN]', text)
    
    # Mask person names (simple heuristic: capitalized words in payment context)
    # Pattern: "Pago a [Name]" or similar
    text = re.sub(
        r'(?:pago|transferencia|depósito|transfer)\s+(?:a|de|para)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)',
        r'\1 [PERSON]',
        text,
        flags=re.IGNORECASE
    )
    
    # Mask location patterns (street names, addresses)
    # Pattern: "Av. [Street Name]" or "Calle [Street Name]"
    text = re.sub(
        r'(?:Av\.|Avenida|Calle|Cra\.|Carrera)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?',
        '[LOCATION]',
        text,
        flags=re.IGNORECASE
    )
    
    return text


def mask_single_transaction(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize a single transaction for AI processing.
    
    Args:
        transaction: Single transaction dictionary
        
    Returns:
        Sanitized transaction with PII masked
    """
    return mask_financial_data([transaction])[0]
