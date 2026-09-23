from sqlalchemy.orm import Session
from typing import Any, cast, Literal, Optional
from datetime import datetime, timezone
import json
import logging
from pydantic import BaseModel, Field
from app.services.anomaly_detector import detect_anomalies
from app.services.forecaster import get_financial_projection
from app.services.insights_builders import _build_transaction_summary, _build_liquidity_summary, _build_credit_card_summary
from google.genai import types
from app.services.ai_models import REASONING_MODEL, with_gemini_retry_async
from app.services.ai_prompts import CORE_RULES, get_persona_prompt
from app.services.gemini_gateway import create_gemini_client

logger = logging.getLogger(__name__)


class SentinelWarning(BaseModel):
    level: Literal["warning", "info", "success"]
    message: str


class SentinelAIReport(BaseModel):
    """Strict contract for the narrative portion returned by Gemini."""

    health_score: int = Field(ge=0, le=100)
    status_summary: str
    top_concerns: list[str]
    recommended_action: str
    warnings: list[SentinelWarning]


class SentinelService:
    """
    Agente Sentinel: El guardián proactivo del ecosistema financiero.
    Consolida métricas, detecta anomalías y genera un reporte de salud integral.
    """
    
    def __init__(self, db: Session, api_key: Optional[str]):
        self.db = db
        self.api_key = api_key
        self.client = create_gemini_client(api_key) if api_key else None

    async def generate_health_report(self, persona: str = "professional") -> dict:
        """
        Genera un reporte de salud consolidado usando IA para unir
        heurística (anomalías/proyecciones) con insights.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # 1. Obtener datos heurísticos
        anomalies = detect_anomalies(self.db)
        projection = get_financial_projection(self.db, months=3)
        liquidity = _build_liquidity_summary(self.db)
        cc_summary = _build_credit_card_summary(self.db, now)
        
        # Nuevos puntos de datos para Sentinel
        from app.services.insights_builders import _build_goals_summary, _build_debt_share_summary, _build_subscription_summary, _build_reminder_summary
        from app.services.ai_assistant_tools import get_fiscal_summary
        from app.services.snapshot_service import SnapshotService
        
        # FASE: Automatización de Snapshots (El Sentinel 'cierra el mes' continuamente)
        # Desactivado temporalmente para evitar creación de data inconsistente
        # SnapshotService.create_or_update_snapshot(self.db, now.month, now.year)
        historical_trends = SnapshotService.get_historical_trends(self.db, limit=4)
        
        goals = _build_goals_summary(self.db)
        debts = _build_debt_share_summary(self.db, now)
        subs = _build_subscription_summary(self.db, now)
        reminders = _build_reminder_summary(self.db, now)
        
        # 0. Burn Rate Analysis (Proactive Alarms)
        from app.models.budget import Budget
        from app.services.budget_service import compute_budget_pacing
        
        budgets = self.db.query(Budget).filter(Budget.month == now.month, Budget.year == now.year).all()
        burn_rate_alarms = []
        for b in budgets:
            pacing = compute_budget_pacing(b, now)
            if pacing["is_over_pacing"]:
                burn_rate_alarms.append({
                    "category": b.name,
                    "spent": b.spent / 100,
                    "expected": pacing["expected_spend"] / 100,
                    "remaining": pacing["remaining"] / 100,
                    "pacing_status": pacing["pacing_status"]
                })
        
        try:
            fiscal = get_fiscal_summary(self.db)
        except Exception as e:
            logger.warning(f"Error getting fiscal summary in Sentinel: {e}")
            fiscal = {"iva_projected": 0, "retencion_projected": 0}
        
        # 2. Construir el contexto para la IA
        context = {
            "liquidez_neta": liquidity["net_liquid"] / 100,
            "runway_meses": projection["runway_months"],
            "anomalias_detectadas": [a["message"] for a in anomalies],
            "deuda_tarjetas": cc_summary["pending_amount"] / 100,
            "metas_progreso": goals["overall_progress_pct"],
            "deudas_pendientes_terceros": debts["total_pending_debt_shares"] / 100,
            "suscripciones_proximas": subs["upcoming_in_30_days"],
            "recordatorios_proximos": reminders["upcoming_count"],
            "monto_pagos_proximos": reminders["total_amount"] / 100,
            "iva_proyectado_mes": fiscal["iva_projected"] / 100,
            "retenciones_proyectadas": fiscal["retencion_projected"] / 100,
            "tendencia_patrimonio_neto": historical_trends,
            "proyeccion_3_meses": projection["timeline"][-1]["projected_balance"] / 100,
            "alarmas_ritmo_gasto": burn_rate_alarms
        }
        context["health_score_calculado"] = self._calculate_health_score(context)

        if self.client is None:
            return self._generate_heuristic_fallback(
                context,
                "Gemini no configurado",
            )
        
        # 3. Prompt Agentico para el Sentinel
        persona_instruction = get_persona_prompt(persona)
        system_instruction = f"""
        {CORE_RULES}

        Eres SENTINEL, el monitor financiero de este ecosistema.
        Tu misión es ser un guardián 360 que audita, proyecta y alerta con total transparencia.

        REGLAS DE COMUNICACIÓN (CRÍTICO):
        - MONEDA: Los montos en el contexto JSON ya están en DÓLARES. NUNCA los trates como centavos.
        - PROHIBIDO usar el término "Runway". Usa "Meses de Supervivencia" o "Días de Reserva".
        - PROHIBIDO usar "Patrimonio neto negativo". Usa "Tus deudas superan tus activos" o "Balance de riqueza en rojo".
        - PROHIBIDO usar "Capacidad de respuesta ante proyecciones". Usa "Flexibilidad ante imprevistos" o "Margen de maniobra futuro".
        - Sé directo, protector y transparente. Eres un sistema de análisis, no una autoridad omnisciente.
        - Eres un observador de solo lectura. No intentes sugerir acciones que impliquen que tú harás algo; tú solo reportas la verdad.
        - ALERTAS DE GASTO: Si 'alarmas_ritmo_gasto' no está vacío, genera avisos específicos en 'warnings' indicando que el usuario va por encima de lo esperado en esas categorías.

        Tu objetivo es generar:
        1. Un "health_score" (0-100).
        2. Un "status_summary" ejecutivo y humano (evita tecnicismos).
        3. "top_concerns": Lista de hallazgos de auditoría (problemas detectados).
        4. "recommended_action": La decisión más importante que el usuario debe tomar.
        5. "warnings": Una lista de alertas cortas con nivel (warning, info, success) y mensaje claro.

        REGLAS PARA HEALTH_SCORE:
        - Copia exactamente el valor de 'health_score_calculado'. El backend calcula y valida el score; tú redactas la explicación.
        - Si la carga fiscal proyectada + Deuda tarjetas > Liquidez Neta, explica el riesgo de liquidez.
        - Si los meses de supervivencia son < 2, explica la falta de reserva.
        
        {persona_instruction}
        """
        
        prompt = f"Datos reales del ecosistema: {json.dumps(context, ensure_ascii=False)}"
        
        try:
            response = await with_gemini_retry_async(
                lambda: self.client.models.generate_content(
                    model=REASONING_MODEL,
                    contents=system_instruction + "\n\n" + prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.0,
                        response_mime_type="application/json",
                        response_schema={
                            "type": "object",
                            "properties": {
                                "health_score": {"type": "integer"},
                                "status_summary": {"type": "string"},
                                "top_concerns": {"type": "array", "items": {"type": "string"}},
                                "recommended_action": {"type": "string"},
                                "warnings": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "level": {"type": "string", "enum": ["warning", "info", "success"]},
                                            "message": {"type": "string"}
                                        },
                                        "required": ["level", "message"]
                                    }
                                }
                            },
                            "required": ["health_score", "status_summary", "top_concerns", "recommended_action", "warnings"]
                        }
                    )
                )
            )
            report = SentinelAIReport.model_validate_json(cast(str, response.text)).model_dump()
            # The score belongs to the deterministic financial rules, not to
            # the language model. Gemini only supplies the narrative around it.
            report["health_score"] = context["health_score_calculado"]
            report["analysis_source"] = "gemini"
            report["alarmas_ritmo_gasto"] = context["alarmas_ritmo_gasto"]
            report["ai_error"] = None
            report["timestamp"] = datetime.now(timezone.utc).isoformat()
            return report
        except Exception:
            logger.exception("Sentinel Gemini request failed; using heuristic fallback")
            return self._generate_heuristic_fallback(context, "Servicio IA no disponible")

    @staticmethod
    def _calculate_health_score(context: dict) -> int:
        """Calculate the stable score used by both Gemini and offline mode."""
        score = 100
        liquidity = float(context.get("liquidez_neta", 0) or 0)
        fiscal_debt = float(context.get("iva_proyectado_mes", 0) or 0)
        fiscal_debt += float(context.get("retenciones_proyectadas", 0) or 0)
        debt = float(context.get("deuda_tarjetas", 0) or 0) + fiscal_debt
        runway = float(context.get("runway_meses", 0) or 0)

        if debt > liquidity:
            score -= 40
        if runway < 2:
            score -= 30
        elif runway < 6:
            score -= 10
        if context.get("anomalias_detectadas"):
            score -= 15
        if context.get("alarmas_ritmo_gasto"):
            score -= 10

        return max(0, min(100, score))

    def _generate_heuristic_fallback(
        self,
        context: dict,
        error_msg: str,
        analysis_source: str = "heuristic",
    ) -> dict:
        """
        Generates a basic health report based on pure math when AI is unavailable.
        """
        score = self._calculate_health_score(context)
        concerns = []
        warnings = []
        
        # 1. Evaluate Liquidity vs Debt
        liquidez = context["liquidez_neta"]
        deuda = (
            context["deuda_tarjetas"]
            + context["iva_proyectado_mes"]
            + context.get("retenciones_proyectadas", 0)
        )
        
        if deuda > liquidez:
            concerns.append("La deuda inmediata supera la liquidez disponible")
            warnings.append({"level": "warning", "message": "Riesgo de liquidez: Deudas > Efectivo"})
            
        # 2. Evaluate Runway
        runway = context["runway_meses"]
        if runway < 2:
            concerns.append("El fondo de emergencia es insuficiente (< 2 meses)")
            warnings.append({"level": "warning", "message": f"Reserva crítica: {runway:.1f} meses"})
        elif runway < 6:
            warnings.append({"level": "info", "message": f"Reserva aceptable: {runway:.1f} meses"})

        # 3. Anomalies
        if context["anomalias_detectadas"]:
            concerns.extend(context["anomalias_detectadas"])
            warnings.append({"level": "info", "message": f"Detectadas {len(context['anomalias_detectadas'])} fugas de dinero"})

        for alarm in context.get("alarmas_ritmo_gasto", []):
            concerns.append(f"Ritmo de gasto elevado en {alarm['category']}")
            warnings.append({
                "level": "warning",
                "message": f"Gasto por encima de lo esperado en {alarm['category']}",
            })

        # Final score clamping
        score = max(0, min(100, score))

        if score < 50:
            risk_level = "alto"
        elif score < 80:
            risk_level = "moderado"
        else:
            risk_level = "bajo"
        
        status_summary = (
            f"MODO SEGURO (IA Offline): Tu salud financiera es de {score}/100. "
            f"Se detecta un nivel de riesgo {risk_level}."
        )

        return {
            "health_score": score,
            "status_summary": status_summary,
            "top_concerns": concerns if concerns else ["Ninguna preocupación crítica detectada por heurística"],
            "recommended_action": "Priorizar el pago de deudas y aumentar el fondo de reserva" if score < 60 else "Mantener el control de gastos actual",
            "warnings": warnings if warnings else [{"level": "success", "message": "Parámetros financieros dentro de rangos normales"}],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "analysis_source": analysis_source,
            "alarmas_ritmo_gasto": context.get("alarmas_ritmo_gasto", []),
            "ai_error": error_msg,
        }
