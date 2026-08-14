from sqlalchemy.orm import Session
from typing import cast, Any
from datetime import datetime, timedelta, timezone
from app.models.transaction import Transaction
import google.genai as genai
from google.genai import types
from app.services.ai_models import REASONING_MODEL, with_gemini_retry
import json
import logging

logger = logging.getLogger(__name__)

class AuditService:
    """
    Servicio de Auditoría Profunda. 
    Busca duplicados semánticos y discrepancias en los datos.
    """
    
    def __init__(self, db: Session, api_key: str):
        self.db = db
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)

    def scan_for_duplicates(self, days: int = 7) -> list:
        """
        Busca transacciones que podrían ser duplicados semánticos.
        Agrupa por monto y fecha, luego usa IA para comparar descripciones.
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # 1. Obtener transacciones sospechosas (mismo monto y fecha cercana)
        # Por simplicidad, buscamos coincidencia exacta de monto en el periodo
        txns = self.db.query(Transaction).filter(
            Transaction.date >= start_date,
            Transaction.is_deleted == False
        ).all()
        
        # Agrupar por monto y día
        potential_groups = {}
        for t in txns:
            key = (t.amount, t.date.date())
            if key not in potential_groups:
                potential_groups[key] = []
            potential_groups[key].append(t)
            
        # Filtrar solo grupos con más de una transacción
        suspect_groups = [g for g in potential_groups.values() if len(g) > 1]
        
        results = []
        for group in suspect_groups:
            # Usar IA para comparar descripciones en el grupo
            if self._is_semantic_duplicate(group):
                results.append({
                    "ids": [t.id for t in group],
                    "amount": group[0].amount,
                    "date": str(group[0].date.date()),
                    "descriptions": [t.description for t in group]
                })
        
        return results

    def _is_semantic_duplicate(self, group: list) -> bool:
        """Usa Gemini para decidir si un grupo de transacciones son duplicados."""
        descriptions = [t.description for t in group]
        
        prompt = f"""
        Analiza estas descripciones de transacciones ocurridas el mismo día con el mismo monto:
        {json.dumps(descriptions, ensure_ascii=False)}
        
        ¿Representan el mismo gasto real (duplicado)? 
        Responde solo con un JSON: {{"is_duplicate": true/false, "reason": "breve explicación"}}
        """
        
        try:
            response = with_gemini_retry(lambda: self.client.models.generate_content(
                model=REASONING_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            ))
            result = json.loads(cast(str, response.text))
            return result.get("is_duplicate", False)
        except Exception as e:
            logger.warning(f"Error checking semantic duplicate: {e}")
            return False
