def test_sri_runs_for_already_categorized_expenses_and_skips_manual_rows(db_session, monkeypatch):
    from app.models.account import Account, AccountType
    from app.models.category import Category
    from app.models.transaction import Transaction
    import app.services.ai_background as ai_background

    account = Account(name="Cuenta", account_type=AccountType.CHECKING, balance=0)
    category = Category(name="Comida")
    db_session.add_all([account, category])
    db_session.commit()

    automatic = Transaction(
        description="Supermercado",
        amount=1000,
        transaction_type="expense",
        payment_method="debit_card",
        account_id=account.id,
        category_id=category.id,
        is_manual=False,
    )
    manual = Transaction(
        description="Clasificación humana",
        amount=2000,
        transaction_type="expense",
        payment_method="debit_card",
        account_id=account.id,
        category_id=category.id,
        is_manual=True,
    )
    db_session.add_all([automatic, manual])
    db_session.commit()
    automatic_id, manual_id = automatic.id, manual.id

    calls = []
    monkeypatch.setattr(ai_background, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(ai_background, "sri_classify_batch", lambda batch, db_session: calls.append(batch) or {0: "Alimentación"})

    ai_background.categorize_transactions_background([automatic_id, manual_id])

    assert len(calls) == 1
    assert len(calls[0]) == 1
    assert calls[0][0]["description"] == "Supermercado"
    assert db_session.query(Transaction).filter(Transaction.id == automatic_id).one().sri_category == "Alimentación"
    assert db_session.query(Transaction).filter(Transaction.id == manual_id).one().sri_category is None
