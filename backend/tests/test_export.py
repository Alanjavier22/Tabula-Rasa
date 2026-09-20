from datetime import datetime, timezone


def test_export_snapshots_uses_snapshot_date(client, db_session):
    from app.models.net_worth_snapshot import NetWorthSnapshot

    db_session.add(NetWorthSnapshot(
        month=9,
        year=2026,
        total_assets=100000,
        total_liabilities=25000,
        net_worth=75000,
        snapshot_date=datetime(2026, 9, 20, tzinfo=timezone.utc),
    ))
    db_session.commit()

    response = client.get("/api/export/snapshots")

    assert response.status_code == 200
    assert "2026-09-20" in response.content.decode("utf-8")
