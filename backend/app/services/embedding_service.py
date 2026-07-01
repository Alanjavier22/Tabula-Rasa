import json
import time
import hashlib
import logging
from typing import Optional, cast
import google.genai as genai
from google.genai import types
from app.services.ai_models import EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
from app.models.transaction_embedding import TransactionEmbedding

logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 8000
MAX_BATCH_SIZE = 100
BATCH_SLEEP_SECONDS = 1


class EmbeddingService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)

    def embed_text(self, text: str, task_type: str = "SEMANTIC_SIMILARITY") -> Optional[list[float]]:
        if not text or not text.strip():
            return None

        text = text.strip()[:MAX_TEXT_LENGTH]

        try:
            response = self.client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSIONS,
                    task_type=task_type,
                ),
            )
            if response.embeddings and len(response.embeddings) > 0:
                return list(response.embeddings[0].values)
            return None
        except Exception as e:
            logger.warning(f"[EmbeddingService] Error embedding text: {e}")
            return None

    def embed_batch(self, texts: list[str], task_type: str = "SEMANTIC_SIMILARITY") -> list[Optional[list[float]]]:
        results: list[Optional[list[float]]] = []
        valid_texts = [t.strip()[:MAX_TEXT_LENGTH] if t else "" for t in texts]

        for i in range(0, len(valid_texts), MAX_BATCH_SIZE):
            chunk = valid_texts[i:i + MAX_BATCH_SIZE]
            if not any(chunk):
                results.extend([None] * len(chunk))
                continue

            try:
                response = self.client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=chunk,
                    config=types.EmbedContentConfig(
                        output_dimensionality=EMBEDDING_DIMENSIONS,
                        task_type=task_type,
                    ),
                )
                if response.embeddings:
                    for emb in response.embeddings:
                        results.append(list(emb.values) if emb.values else None)
                else:
                    results.extend([None] * len(chunk))
            except Exception as e:
                logger.warning(f"[EmbeddingService] Error in batch embedding: {e}")
                results.extend([None] * len(chunk))

            if i + MAX_BATCH_SIZE < len(valid_texts):
                time.sleep(BATCH_SLEEP_SECONDS)

        return results

    @staticmethod
    def _normalize_description(description: str) -> str:
        return (description or "").strip().upper()

    @staticmethod
    def _description_hash(description: str) -> str:
        normalized = EmbeddingService._normalize_description(description)
        return hashlib.sha256(normalized.encode()).hexdigest()

    def get_or_create_embedding(
        self, description: str, db, task_type: str = "SEMANTIC_SIMILARITY"
    ) -> Optional[list[float]]:
        if not description or not description.strip():
            return None

        desc_hash = self._description_hash(description)

        cached = db.query(TransactionEmbedding).filter(
            TransactionEmbedding.description_hash == desc_hash
        ).first()

        if cached:
            try:
                return json.loads(cached.embedding)
            except (json.JSONDecodeError, TypeError):
                pass

        embedding = self.embed_text(description, task_type=task_type)
        if embedding is None:
            return None

        try:
            new_record = TransactionEmbedding(
                description_hash=desc_hash,
                description=description.strip(),
                embedding=json.dumps(embedding),
                source="transaction",
            )
            db.add(new_record)
            db.flush()
        except Exception as e:
            logger.warning(f"[EmbeddingService] Error caching embedding: {e}")

        return embedding

    def find_similar_pattern(
        self, description: str, db, threshold: float = 0.85
    ) -> Optional[tuple[str, float]]:
        query_embedding = self.get_or_create_embedding(description, db)
        if query_embedding is None:
            return None

        pattern_records = db.query(TransactionEmbedding).filter(
            TransactionEmbedding.source == "pattern",
            TransactionEmbedding.category_id.isnot(None),
        ).all()

        if not pattern_records:
            return None

        best_match: Optional[tuple[str, float]] = None
        best_score = 0.0

        for record in pattern_records:
            try:
                stored_embedding = json.loads(record.embedding)
            except (json.JSONDecodeError, TypeError):
                continue

            score = self.cosine_similarity(query_embedding, stored_embedding)
            if score > best_score:
                best_score = score
                best_match = (cast(str, record.category_id), score)

        if best_match and best_score >= threshold:
            try:
                record = db.query(TransactionEmbedding).filter(
                    TransactionEmbedding.category_id == best_match[0],
                    TransactionEmbedding.source == "pattern",
                ).first()
                if record:
                    record.hit_count = (record.hit_count or 0) + 1
                    db.flush()
            except Exception:
                pass
            return best_match

        return None

    def store_pattern_embedding(self, description: str, category_id: str, db):
        if not description or not description.strip() or not category_id:
            return

        desc_hash = self._description_hash(description)

        existing = db.query(TransactionEmbedding).filter(
            TransactionEmbedding.description_hash == desc_hash
        ).first()

        if existing:
            existing.category_id = category_id
            existing.source = "pattern"
            db.flush()
            return

        embedding = self.embed_text(description, task_type="RETRIEVAL_DOCUMENT")
        if embedding is None:
            return

        try:
            new_record = TransactionEmbedding(
                description_hash=desc_hash,
                description=description.strip(),
                embedding=json.dumps(embedding),
                source="pattern",
                category_id=category_id,
            )
            db.add(new_record)
            db.flush()
        except Exception as e:
            logger.warning(f"[EmbeddingService] Error storing pattern embedding: {e}")

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0

        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(y * y for y in b) ** 0.5

        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0

        return dot_product / (norm_a * norm_b)
