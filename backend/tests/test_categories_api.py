def test_category_crud_happy_path(client):
    created = client.post("/categories/", json={"name": "Comida", "color": "#ff0000"}).json()
    category_id = created["id"]
    assert created["name"] == "Comida"

    r = client.get(f"/categories/{category_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Comida"

    r = client.put(f"/categories/{category_id}", json={"name": "Comida y Bebida"})
    assert r.status_code == 200
    assert r.json()["name"] == "Comida y Bebida"

    r = client.delete(f"/categories/{category_id}")
    assert r.status_code == 200

    r = client.get(f"/categories/{category_id}")
    assert r.status_code == 404


def test_export_import_roundtrip(client):
    client.post("/categories/", json={"name": "Transporte"})

    exported = client.get("/categories/export")
    assert exported.status_code == 200
    exported_data = exported.json()
    assert any(c["name"] == "Transporte" for c in exported_data)

    r = client.post("/categories/import", json=exported_data)
    assert r.status_code == 200
    body = r.json()
    # Ya existen por nombre -> el import los debe saltar, no duplicar.
    assert body["skipped_count"] == len(exported_data)
    assert body["imported_count"] == 0

    all_categories = client.get("/categories/").json()
    assert len([c for c in all_categories if c["name"] == "Transporte"]) == 1
