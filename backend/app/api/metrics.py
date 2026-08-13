"""
Agregador de métricas: combina los sub-routers de cashflow, balance sheet
y dashboard bajo el prefijo /metrics compartido. Se partió en 3 archivos
por dominio (antes: 848 líneas en un solo módulo) — ver
metrics_cashflow.py, metrics_balance_sheet.py, metrics_dashboard.py.
"""
from fastapi import APIRouter, Depends
from app.api.auth import get_current_device
from app.api.metrics_cashflow import router as cashflow_router
from app.api.metrics_balance_sheet import router as balance_sheet_router
from app.api.metrics_dashboard import router as dashboard_router

router = APIRouter(
    prefix="/metrics",
    tags=["Metrics"],
    redirect_slashes=False,
    dependencies=[Depends(get_current_device)]
)

router.include_router(cashflow_router)
router.include_router(balance_sheet_router)
router.include_router(dashboard_router)
