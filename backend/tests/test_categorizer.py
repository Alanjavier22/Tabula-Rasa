"""Regresiones del adaptador de categorización individual."""

import json
from types import SimpleNamespace

from app.models.category_pattern import CategoryPattern
from app.models.category import Category
from app.models.config import Config
from app.services import categorizer


def test_get_semantic_category_devuelve_solo_el_id(db_session, monkeypatch):
    category = Category(name="Otros (🔄)")
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    monkeypatch.setattr(categorizer, "AI_ENABLED", False)

    result = categorizer.get_semantic_category(
        "Compra sin patrón",
        1000,
        db_session=db_session,
        transaction_type="expense",
    )

    assert result == category.id
    assert not isinstance(result, tuple)


def test_categorize_batch_prioriza_heuristica_memoria_y_fallback(db_session, monkeypatch):
    heuristic_category = Category(name="Obligaciones Financieras")
    pattern_category = Category(name="Compras Personales y Retail")
    fallback_category = Category(name="Otros (🔄)")
    db_session.add_all([heuristic_category, pattern_category, fallback_category])
    db_session.flush()
    db_session.add(CategoryPattern(
        pattern="COMERCIO ESPECIAL",
        category_id=pattern_category.id,
        source="user",
    ))
    db_session.commit()
    db_session.refresh(heuristic_category)
    db_session.refresh(pattern_category)
    db_session.refresh(fallback_category)

    monkeypatch.setattr(categorizer, "AI_ENABLED", False)
    result = categorizer.categorize_batch([
        {"description": "Pago de tarjeta de credito", "transaction_type": "expense"},
        {"description": "Comercio especial", "transaction_type": "expense"},
        {"description": "Descripción ambigua", "transaction_type": "expense"},
    ], db_session=db_session, throttle=False)

    assert result == {
        0: (heuristic_category.id, False),
        1: (pattern_category.id, False),
        2: (fallback_category.id, True),
    }


def test_categorize_batch_aplica_resultados_de_ia_y_reintenta_503(db_session, monkeypatch):
    food_category = Category(name="Alimentación")
    fallback_category = Category(name="Otros (🔄)")
    db_session.add_all([
        food_category,
        fallback_category,
        Config(key="gemini_api_key", value="test-key"),
    ])
    db_session.commit()
    db_session.refresh(food_category)
    db_session.refresh(fallback_category)

    class FakeModels:
        calls = 0

        def generate_content(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("503 unavailable")
            return SimpleNamespace(text=json.dumps({
                "items": [
                    {
                        "index": 0,
                        "category_id": food_category.id,
                        "confidence": 0.9,
                        "needs_clarification": False,
                    },
                    {
                        "index": 1,
                        "category_id": food_category.id,
                        "confidence": 0.5,
                        "needs_clarification": False,
                    },
                    {
                        "index": 2,
                        "category_id": "categoría-inexistente",
                        "confidence": 0.9,
                    },
                    {"index": None, "category_id": food_category.id, "confidence": 1.0},
                ]
            }))

    fake_models = FakeModels()
    monkeypatch.setattr(categorizer, "AI_ENABLED", True)
    monkeypatch.setattr(categorizer.genai, "Client", lambda **_kwargs: SimpleNamespace(models=fake_models))
    waits = []
    monkeypatch.setattr(categorizer.time, "sleep", lambda seconds: waits.append(seconds))

    result = categorizer.categorize_batch([
        {"description": "Compra supermercado", "amount": 1000, "transaction_type": "expense"},
        {"description": "Compra farmacia", "amount": 1200, "transaction_type": "expense"},
        {"description": "Compra inválida", "amount": 800, "transaction_type": "expense"},
        {"description": "Compra sin respuesta", "amount": 700, "transaction_type": "expense"},
    ], db_session=db_session, throttle=True)

    assert result == {
        0: (food_category.id, False),
        1: (food_category.id, True),
        2: (fallback_category.id, True),
        3: (fallback_category.id, True),
    }
    assert fake_models.calls == 2
    assert waits == [0.5, 8]


def test_categorize_batch_fallbacks_without_api_key(db_session, monkeypatch):
    category = Category(name="Otros (🔄)")
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    monkeypatch.setattr(categorizer, "AI_ENABLED", True)

    result = categorizer.categorize_batch([
        {"description": "Compra sin configuración", "amount": 1000, "transaction_type": "expense"},
    ], db_session=db_session, throttle=False)

    assert result == {0: (category.id, True)}


def test_categorize_batch_fallbacks_on_error_no_transitorio(db_session, monkeypatch):
    category = Category(name="Otros (🔄)")
    db_session.add_all([category, Config(key="gemini_api_key", value="test-key")])
    db_session.commit()
    db_session.refresh(category)

    class FailingModels:
        def generate_content(self, **_kwargs):
            raise RuntimeError("respuesta inválida")

    monkeypatch.setattr(categorizer, "AI_ENABLED", True)
    monkeypatch.setattr(
        categorizer.genai,
        "Client",
        lambda **_kwargs: SimpleNamespace(models=FailingModels()),
    )

    result = categorizer.categorize_batch([
        {"description": "Compra desconocida", "amount": 1000, "transaction_type": "expense"},
    ], db_session=db_session, throttle=False)

    assert result == {0: (category.id, True)}
