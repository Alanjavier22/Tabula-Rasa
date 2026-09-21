from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.category import Category
from app.models.config import Config
from app.models.account import Account, AccountType
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.debt_share import DebtShare, DebtShareStatus
from app.models.iou import IOU, IOUStatus, IOUType
from app.models.subscription import Subscription, SubscriptionFrequency
from app.models.transaction import PaymentMethod, Transaction
from app.services import cash_flow
from app.services.cash_flow import CashFlowService


def test_projected_balance_is_zero_without_projection_inputs(db_session, monkeypatch):
    monkeypatch.setattr(
        CashFlowService,
        "calculate_seasonal_adjustment",
        staticmethod(lambda db, start_date, end_date: 0),
    )

    result = CashFlowService.get_projected_balance(db_session, 30)

    assert result.to_dict() == {
        "days": 30,
        "current_balance": 0,
        "projected_balance": 0,
        "projected_income": 0,
        "projected_expenses": 0,
        "seasonal_adjustment": 0,
        "breakdown": {
            "subscriptions": 0,
            "ious": 0,
            "credit_cards": 0,
            "debt_shares": 0,
            "seasonal": 0,
        },
    }


def test_projected_balance_combines_recurring_income_and_obligations(db_session, monkeypatch):
    monkeypatch.setattr(
        CashFlowService,
        "calculate_seasonal_adjustment",
        staticmethod(lambda db, start_date, end_date: 0),
    )
    now = datetime.now().replace(microsecond=0)
    account = Account(name="Cuenta líquida", account_type=AccountType.CHECKING, balance=1000)
    db_session.add(account)
    db_session.flush()
    db_session.add_all([
        Transaction(
            description="Sueldo",
            amount=1000,
            transaction_type="income",
            payment_method=PaymentMethod.TRANSFER,
            date=datetime(now.year, now.month, 1) - timedelta(days=1),
        ),
        Transaction(
            description="Sueldo",
            amount=1000,
            transaction_type="income",
            payment_method=PaymentMethod.TRANSFER,
            date=datetime(now.year, now.month, 1) - timedelta(days=32),
        ),
        Subscription(
            name="Suscripción mensual",
            amount=100,
            frequency=SubscriptionFrequency.MONTHLY,
            next_billing_date=now + timedelta(days=10),
        ),
        IOU(
            person_name="Persona A",
            amount=50,
            iou_type=IOUType.I_OWE,
            status=IOUStatus.PENDING,
        ),
        IOU(
            person_name="Persona B",
            amount=30,
            iou_type=IOUType.THEY_OWE,
            status=IOUStatus.PENDING,
        ),
    ])
    statement = CreditCardStatement(
        account_id=account.id,
        statement_balance=200,
        user_share=200,
        amount_paid=50,
        status=StatementStatus.PENDING,
        payment_due_date=now + timedelta(days=10),
        month=now.month,
        year=now.year,
    )
    db_session.add(statement)
    db_session.flush()
    db_session.add(
        DebtShare(
            statement_id=statement.id,
            person_name="Persona C",
            amount=40,
            status=DebtShareStatus.PENDING,
        )
    )
    db_session.commit()

    result = CashFlowService.get_projected_balance(db_session, 30)

    assert result.current_balance == 1000
    assert result.projected_income == 317
    assert result.projected_expenses == 300
    assert result.projected_balance == 1087
    assert result.breakdown == {
        "subscriptions": 100,
        "ious": 20,
        "credit_cards": 150,
        "debt_shares": 40,
        "seasonal": 0,
    }


def test_income_history_handles_ignored_categories_and_blacklist_formats(db_session):
    ignored_category = Category(name="Transferencia")
    config = Config(key="income_blacklist", value='["IGNORAR"]')
    db_session.add_all([ignored_category, config])
    db_session.flush()
    db_session.add(Transaction(
        description="Ingreso válido",
        amount=100,
        transaction_type="income",
        payment_method=PaymentMethod.CASH,
        date=datetime.now(),
        category_id=ignored_category.id,
    ))
    db_session.flush()

    transactions, blacklist, _ = cash_flow._load_income_history(db_session, datetime.now())
    assert transactions == []
    assert blacklist == ["IGNORAR"]

    config.value = "IGNORAR, OTRO"
    db_session.flush()
    _, blacklist, _ = cash_flow._load_income_history(db_session, datetime.now())
    assert blacklist == ["IGNORAR", "OTRO"]


def test_income_helpers_cover_scoring_and_filtered_sources(db_session, monkeypatch):
    now = datetime.now().replace(microsecond=0)
    make_tx = lambda date, amount=100: SimpleNamespace(date=date, amount=amount, description="Ingreso")

    assert cash_flow._group_recurring_income([make_tx(now, 100)], ["INGRESO"]) == {}
    assert cash_flow._get_temporal_consistency_score([]) == 0
    assert cash_flow._get_temporal_consistency_score([make_tx(now), make_tx(now.replace(day=now.day - 1))]) == 30
    assert cash_flow._get_temporal_consistency_score([
        make_tx(now.replace(day=1)),
        make_tx(now.replace(day=15)),
    ]) == 15
    assert cash_flow._get_temporal_consistency_score([
        make_tx(now.replace(day=1)),
        make_tx(now.replace(day=28)),
    ]) == 0

    assert cash_flow._get_amount_stability_score([make_tx(now)]) == 0
    assert cash_flow._get_amount_stability_score([make_tx(now, 100), make_tx(now, 100)]) == 20
    assert cash_flow._get_amount_stability_score([make_tx(now, 100), make_tx(now, 160)]) == 10
    assert cash_flow._get_amount_stability_score([make_tx(now, 10), make_tx(now, 100)]) == 0

    one_month = [make_tx(now)]
    two_months = [make_tx(now.replace(day=1)), make_tx(now.replace(day=2) - timedelta(days=31))]
    assert cash_flow._get_income_source_score("INGRESO", one_month, 180) == 0
    assert cash_flow._get_income_source_score("SUELDO", two_months, 180) == 100
    assert cash_flow._get_income_source_score("INGRESO", two_months, 180) >= 45

    db_session.add(Transaction(
        description="Ingreso aislado",
        amount=100,
        transaction_type="income",
        payment_method=PaymentMethod.CASH,
        date=now,
    ))
    db_session.flush()
    assert cash_flow._calculate_projected_income(db_session, now, 30) == 0

    monkeypatch.setattr(db_session, "commit", lambda: (_ for _ in ()).throw(RuntimeError("commit failed")))
    _, blacklist, _ = cash_flow._load_income_history(db_session, now)
    assert blacklist == cash_flow.DEFAULT_INCOME_BLACKLIST


def test_subscription_helpers_ignore_missing_and_out_of_range_dates(db_session):
    now = datetime.now().replace(microsecond=0)
    future = now + timedelta(days=30)

    assert cash_flow._is_subscription_due(None, now, future) is False
    assert cash_flow._is_subscription_due(now + timedelta(days=31), now, future) is False

    db_session.add_all([
        Subscription(
            name="Fuera de rango",
            amount=90,
            frequency=SubscriptionFrequency.MONTHLY,
            next_billing_date=now - timedelta(days=1),
        ),
        Subscription(
            name="Dentro de rango",
            amount=100,
            frequency=SubscriptionFrequency.MONTHLY,
            next_billing_date=now + timedelta(days=1),
        ),
    ])
    db_session.commit()

    assert cash_flow._calculate_subscription_cost(db_session, now, future) == 100
