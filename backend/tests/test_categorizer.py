"""Regresiones del adaptador de categorización individual."""

from app.models.category import Category
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
