import re
from datetime import datetime, date
from typing import Optional, Union

def parse_date_robustly(val: Optional[Union[str, datetime, date]]) -> Optional[datetime]:
    """
    Parses a date/datetime from various potential formats robustly.
    Handles SQLite format, ISO format, quirks like '2026-06-01 00:00:00T00:00:00',
    and standard date formats. Returns None if value is None or completely invalid.
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day)
    
    if not isinstance(val, str):
        return None
        
    cleaned = val.strip()
    if not cleaned:
        return None

    # Handle duplicate or quirky formats (e.g. "2026-06-01 00:00:00T00:00:00")
    match = re.match(r'^(\d{4}-\d{2}-\d{2})', cleaned)
    if match:
        date_part = match.group(1)
        time_part = "00:00:00"
        
        # Look for HH:MM:SS pattern
        time_match = re.search(r'(\d{2}:\d{2}:\d{2})', cleaned)
        if time_match:
            time_part = time_match.group(1)
            
        try:
            return datetime.fromisoformat(f"{date_part}T{time_part}")
        except ValueError:
            pass

    # Try standard strptime formats
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d"
    ):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
            
    # Try last resort standard isoformat
    try:
        return datetime.fromisoformat(cleaned.replace('Z', '+00:00'))
    except ValueError:
        return None
