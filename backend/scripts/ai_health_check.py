import sys
import os
import json
import time
from datetime import datetime
from typing import Any, cast

# Añadir el path base para importar módulos de la app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from app.models.config import Config
from app.services.categorizer import get_semantic_category
from app.services.sri_classifier import SRIClassifier
from app.services.sentinel_service import SentinelService

def run_health_checks():
    print(f"--- AI ECOSYSTEM HEALTH CHECK ({datetime.now().isoformat()}) ---")
    
    db = SessionLocal()
    config = db.query(Config).filter(Config.key == "gemini_api_key").first()
    api_key = str(config.value) if config and config.value else None
    
    if not api_key:
        print("? ERROR: No Gemini API Key found in database.")
        return

    results = []
    
    # 1. Test Categorizador
    print("\n[1/3] Probando Categorizador Semántico...")
    try:
        # Ejemplo quemado para ahorrar tokens y verificar lógica
        start_time = time.time()
        cat_id = get_semantic_category("PAGO NETFLIX", 1500, db_session=db, transaction_type="expense")
        elapsed = time.time() - start_time
        status = "OK" if cat_id else "FAIL (No category returned)"
        print(f"  > Status: {status} ({elapsed:.2f}s)")
        results.append({"model": "Categorizer", "status": status, "time": elapsed})
    except Exception as e:
        print(f"  > Status: ERROR ({str(e)})")
        results.append({"model": "Categorizer", "status": "ERROR", "error": str(e)})

    # Delay para respetar RPM (max 15 RPM = 1 cada 4 seg)
    time.sleep(4)

    # 2. Test Clasificador SRI
    print("\n[2/3] Probando Clasificador SRI...")
    try:
        classifier = SRIClassifier(api_key=api_key)
        start_time = time.time()
        sri_cat = classifier.classify("SUPERMAXI COMPRAS", "Comida")
        elapsed = time.time() - start_time
        status = "OK" if sri_cat == "Alimentación" else f"WARN (Returned: {sri_cat})"
        print(f"  > Status: {status} ({elapsed:.2f}s)")
        results.append({"model": "SRI Classifier", "status": status, "time": elapsed})
    except Exception as e:
        print(f"  > Status: ERROR ({str(e)})")
        results.append({"model": "SRI Classifier", "status": "ERROR", "error": str(e)})

    time.sleep(4)

    # 3. Test Agente Sentinel
    print("\n[3/3] Probando Agente Sentinel...")
    try:
        sentinel = SentinelService(db, api_key)
        start_time = time.time()
        report = sentinel.generate_health_report()
        elapsed = time.time() - start_time
        status = "OK" if report.get("health_score") is not None else "FAIL"
        print(f"  > Health Score: {report.get('health_score')}/100")
        print(f"  > Status: {status} ({elapsed:.2f}s)")
        results.append({"model": "Sentinel Agent", "status": status, "time": elapsed})
    except Exception as e:
        print(f"  > Status: ERROR ({str(e)})")
        results.append({"model": "Sentinel Agent", "status": "ERROR", "error": str(e)})

    print("\n--- RESUMEN FINAL ---")
    for res in results:
        print(f"{res['model']}: {res['status']}")
    
    db.close()

if __name__ == "__main__":
    run_health_checks()
