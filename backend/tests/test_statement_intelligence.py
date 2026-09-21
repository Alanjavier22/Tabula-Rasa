"""
Cubre las dos piezas críticas de la importación de estados de cuenta que no
dependen de la IA: el fingerprint de deduplicación y la persistencia final
de transacciones confirmadas. parse_statement() (requiere mockear genai.Client)
queda explícitamente fuera de esta ronda - deuda pendiente separada.
"""
from sqlalchemy.orm import sessionmaker

from app.models.account import Account, AccountType
from app.models.credit_card_statement import CreditCardStatement
from app.models.debt_share import DebtShare
from app.models.deferred_payment import DeferredPayment
from app.models.import_log import ImportLog
from app.models.iou import IOU
from app.models.transaction import Transaction
from app.services.statement_intelligence import StatementIntelligenceService


def _make_log(db_session):
    account = Account(name="Tarjeta", account_type=AccountType.CREDIT_CARD, balance=0)
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)

    log = ImportLog(file_hash="hash-abc123", filename="estado.pdf", account_id=account.id, status="pending")
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    return account, log


def test_generate_fingerprint_is_deterministic(db_session):
    service = StatementIntelligenceService(db_session=db_session)
    fp1 = service.generate_fingerprint("2026-01-01", "Compra Super", 1000, "acc-1")
    fp2 = service.generate_fingerprint("2026-01-01", "Compra Super", 1000, "acc-1")
    assert fp1 == fp2


def test_generate_fingerprint_differs_by_index_and_deferred_info(db_session):
    service = StatementIntelligenceService(db_session=db_session)
    base = service.generate_fingerprint("2026-01-01", "Cuota", 1000, "acc-1")
    diff_index = service.generate_fingerprint("2026-01-01", "Cuota", 1000, "acc-1", index=1)
    diff_deferred = service.generate_fingerprint("2026-01-01", "Cuota", 1000, "acc-1", deferred_info="3/12")

    assert base != diff_index
    assert base != diff_deferred
    assert diff_index != diff_deferred


def test_finalize_import_creates_transactions_and_skips_duplicates(db_session):
    account, log = _make_log(db_session)
    account_id, log_id = account.id, log.id  # capturar antes de que finalize_import cierre la sesión
    service = StatementIntelligenceService(db_session=db_session)

    confirmed_transactions = [
        {
            "date": "2026-03-01",
            "description": "Compra nueva",
            "amount_cents": 1000,
            "transaction_type": "expense",
            "fingerprint": "fp-nueva",
            "is_duplicate": False,
        },
        {
            "date": "2026-03-02",
            "description": "Ya existía",
            "amount_cents": 2000,
            "transaction_type": "expense",
            "fingerprint": "fp-duplicada",
            "is_duplicate": True,
        },
    ]

    new_count = service.finalize_import(log_id, confirmed_transactions)
    assert new_count == 1

    # finalize_import cierra self.db en su `finally`; se abre una sesión nueva
    # sobre el mismo engine (StaticPool en tests -> misma conexión in-memory).
    VerifySession = sessionmaker(bind=db_session.get_bind())
    verify = VerifySession()
    try:
        txs = verify.query(Transaction).filter(Transaction.account_id == account_id).all()
        assert len(txs) == 1
        assert txs[0].description == "Compra nueva"
        assert txs[0].amount == 1000
        assert txs[0].fingerprint == "fp-nueva"

        refreshed_log = verify.query(ImportLog).filter(ImportLog.id == log_id).first()
        assert refreshed_log.status == "processed"
    finally:
        verify.close()


def test_finalize_import_syncs_statement_sharing_and_deferred_state(db_session):
    account, log = _make_log(db_session)
    account_id, log_id = account.id, log.id
    metadata = {
        "statement_period": "Marzo 2026",
        "statement_month": 3,
        "statement_year": 2026,
        "statement_balance_cents": 10000,
        "user_share_cents": 5000,
        "payment_due_date": "2026-03-20",
        "cut_off_date": "2026-03-05",
        "credit_limit_cents": 20000,
        "debt_shares": [{"person_name": "Ana", "amount_cents": 500}],
    }
    confirmed = [{
        "date": "2026-03-01",
        "description": "Compra diferida supermercado",
        "amount_cents": 1000,
        "transaction_type": "expense",
        "fingerprint": "fp-diferida-1",
        "is_duplicate": False,
        "is_deferred": True,
        "deferred_info": "2/6",
        "shared_with": "Ana",
        "shared_amount": 500,
    }]

    service = StatementIntelligenceService(db_session=db_session)
    assert service.finalize_import(log_id, confirmed, metadata) == 1

    VerifySession = sessionmaker(bind=db_session.get_bind())
    verify = VerifySession()
    try:
        transaction = verify.query(Transaction).filter(Transaction.account_id == account_id).one()
        statement = verify.query(CreditCardStatement).filter(CreditCardStatement.account_id == account_id).one()
        debt_share = verify.query(DebtShare).filter(DebtShare.statement_id == statement.id).one()
        deferred = verify.query(DeferredPayment).filter(DeferredPayment.account_id == account_id).one()
        iou = verify.query(IOU).filter(IOU.transaction_id == transaction.id).one()

        assert transaction.description == "Compra diferida supermercado"
        assert statement.statement_balance == 10000
        assert statement.user_share == 5000
        assert debt_share.person_name == "Ana"
        assert debt_share.amount == 500
        assert deferred.current_installment == 2
        assert deferred.total_installments == 6
        assert deferred.shared_with == "Ana"
        assert deferred.shared_amount == 500
        assert iou.person_name == "Ana"
        assert iou.amount == 500
        assert verify.get(Account, account_id).credit_limit == 20000
        assert verify.get(Account, account_id).balance == -10000

        second_log = ImportLog(
            file_hash="hash-def456",
            filename="estado-reimportado.pdf",
            account_id=account_id,
            status="pending",
        )
        verify.add(second_log)
        verify.commit()
        second_log_id = second_log.id
    finally:
        verify.close()

    second_metadata = {
        **metadata,
        "statement_balance_cents": 12000,
        "user_share_cents": 6000,
        "payment_due_date": "2026-03-22",
        "cut_off_date": "2026-03-06",
        "credit_limit_cents": 25000,
        "debt_shares": [{"person_name": "Luis", "amount_cents": 300}],
    }
    second_confirmed = [{
        **confirmed[0],
        "fingerprint": "fp-diferida-2",
        "shared_with": "Luis",
        "shared_amount": 300,
    }]
    service = StatementIntelligenceService(db_session=VerifySession())
    assert service.finalize_import(second_log_id, second_confirmed, second_metadata) == 1

    verify = VerifySession()
    try:
        statement = verify.query(CreditCardStatement).filter(CreditCardStatement.account_id == account_id).one()
        debt_share = verify.query(DebtShare).filter(DebtShare.statement_id == statement.id).one()
        deferred = verify.query(DeferredPayment).filter(DeferredPayment.account_id == account_id).one()
        account = verify.get(Account, account_id)

        assert statement.statement_balance == 12000
        assert statement.user_share == 6000
        assert debt_share.person_name == "Luis"
        assert deferred.shared_with == "Luis"
        assert deferred.shared_amount == 300
        assert account.credit_limit == 25000
        assert account.balance == -12000
    finally:
        verify.close()
