from sqlalchemy.orm import Session
from typing import cast, Any, Optional
from datetime import datetime, timedelta, timezone
from app.models.transaction import Transaction
from app.services.embedding_service import EmbeddingService
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
        self.embedding_service = EmbeddingService(api_key=api_key)

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
        """Usa embeddings para decidir si un grupo de transacciones son duplicados."""
        descriptions = [t.description for t in group]
        if len(descriptions) < 2:
            return False

        valid_descs = [d for d in descriptions if d and d.strip()]
        if len(valid_descs) < 2:
            return False

        try:
            embeddings = []
            for desc in valid_descs:
                emb = self.embedding_service.get_or_create_embedding(desc, self.db)
                if emb is not None:
                    embeddings.append(emb)

            if len(embeddings) < 2:
                return False

            for i in range(len(embeddings)):
                for j in range(i + 1, len(embeddings)):
                    sim = EmbeddingService.cosine_similarity(embeddings[i], embeddings[j])
                    if sim > 0.92:
                        return True
            return False
        except Exception as e:
            logger.warning(f"Error checking semantic duplicate with embeddings: {e}")
            return False
