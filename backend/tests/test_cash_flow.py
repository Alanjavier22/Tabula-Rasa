from datetime import datetime, timedelta

from app.models.account import Account, AccountType
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.debt_share import DebtShare, DebtShareStatus
from app.models.iou import IOU, IOUStatus, IOUType
from app.models.subscription import Subscription, SubscriptionFrequency
from app.models.transaction import PaymentMethod, Transaction
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
