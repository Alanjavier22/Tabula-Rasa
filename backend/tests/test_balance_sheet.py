from datetime import datetime, timezone


def test_balance_sheet_uses_snapshot_date(db_session):
    from app.models.net_worth_snapshot import NetWorthSnapshot
    from app.services.balance_sheet import BalanceSheetService

    db_session.add(NetWorthSnapshot(
        month=9,
        year=2026,
        total_assets=100000,
        total_liabilities=25000,
        net_worth=75000,
        snapshot_date=datetime(2026, 9, 20, tzinfo=timezone.utc),
    ))
    db_session.commit()

    balance_sheet = BalanceSheetService.get_balance_sheet(db_session, 9, 2026)

    assert balance_sheet is not None
    assert balance_sheet["date"].startswith("2026-09-20")
