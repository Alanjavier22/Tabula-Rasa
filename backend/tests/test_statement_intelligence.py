"""
Cubre las dos piezas críticas de la importación de estados de cuenta que no
dependen de la IA: el fingerprint de deduplicación y la persistencia final
de transacciones confirmadas. parse_statement() (requiere mockear genai.Client)
queda explícitamente fuera de esta ronda - deuda pendiente separada.
"""
from sqlalchemy.orm import sessionmaker

from app.models.account import Account, AccountType
from app.models.import_log import ImportLog
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
