import uuid
from typing import Union


# Fixed namespace UUID for deterministic UUIDv5 generation
# This ensures that the same legacy ID always maps to the same UUID
NAMESPACE_UUID = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # DNS namespace (standard)


def generate_uuid_from_legacy_id(legacy_id: Union[int, str], table_name: str = "default") -> str:
    """
    Generate deterministic UUIDv5 from legacy numeric ID.
    
    This allows legacy data migration to produce consistent UUIDs across multiple runs,
    preventing duplicates when the UPSERT logic from sync.py is used.
    
    Args:
        legacy_id: The old numeric ID (e.g., 123)
        table_name: Table name to namespace different entities (e.g., "transactions", "accounts")
        
    Returns:
        String representation of UUIDv5
        
    Example:
        >>> generate_uuid_from_legacy_id(123, "transactions")
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        >>> generate_uuid_from_legacy_id(123, "transactions")  # Same input = same output
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    """
    # Convert legacy_id to string for consistent hashing
    legacy_str = str(legacy_id)
    
    # Create namespace-specific UUID by combining table name with legacy ID
    # This ensures that ID=123 in "transactions" != ID=123 in "accounts"
    namespace_key = f"{table_name}:{legacy_str}"
    
    # Generate UUIDv5 (SHA-1 based, deterministic)
    new_uuid = uuid.uuid5(NAMESPACE_UUID, namespace_key)
    
    return str(new_uuid)


def generate_uuid_batch(legacy_ids: list[Union[int, str]], table_name: str = "default") -> list[str]:
    """
    Generate deterministic UUIDs for a batch of legacy IDs.
    
    Args:
        legacy_ids: List of old numeric IDs
        table_name: Table name for namespacing
        
    Returns:
        List of UUID strings in the same order as input
    """
    return [generate_uuid_from_legacy_id(legacy_id, table_name) for legacy_id in legacy_ids]


def validate_uuid_format(uuid_str: str) -> bool:
    """
    Validate if a string is a valid UUID.
    
    Args:
        uuid_str: String to validate
        
    Returns:
        True if valid UUID format, False otherwise
    """
    try:
        uuid.UUID(uuid_str)
        return True
    except (ValueError, AttributeError):
        return False
