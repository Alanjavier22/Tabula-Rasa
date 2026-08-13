"""
Agregador de /api/ai: combina los sub-routers de categorización, what-if,
anomalías y audio/recibo bajo el prefijo compartido. Se partió en 5 archivos
por dominio (antes: 510 líneas en un solo módulo) — ver ai_shared.py,
ai_categories.py, ai_whatif.py, ai_anomalies.py, ai_receipts.py.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import google.genai as genai
from app.services.ai_models import LITE_MODEL
from database import get_db
from app.api.auth import get_current_device
from app.api.ai_shared import get_gemini_key
from app.api.ai_categories import router as categories_router
from app.api.ai_whatif import router as whatif_router
from app.api.ai_anomalies import router as anomalies_router
from app.api.ai_receipts import router as receipts_router

router = APIRouter(
    prefix="/api/ai",
    tags=["AI"],
    dependencies=[Depends(get_current_device)]
)

router.include_router(categories_router)
router.include_router(whatif_router)
router.include_router(anomalies_router)
router.include_router(receipts_router)


@router.get("/test-component")
async def test_component(component: str, db: Session = Depends(get_db)):
    """
    DIAGNOSTIC: Test if an AI component is responding correctly.
    """
    api_key = get_gemini_key(db)
    client = genai.Client(api_key=api_key)
    try:
        prompt = f"Test {component} component. Respond OK."
        response = client.models.generate_content(model=LITE_MODEL, contents=prompt)
        text = response.text or "OK"
        return {"status": "success", "message": text.strip()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
