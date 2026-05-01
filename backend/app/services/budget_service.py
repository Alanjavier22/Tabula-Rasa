"""
Budget pacing service — centralizes all pacing/progress calculations.

All monetary arithmetic uses Decimal. All date logic uses UTC.
"""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
import calendar

from app.models.budget import Budget


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# A budget is "over pacing" if spent exceeds expected by more than this factor.
_OVER_PACING_THRESHOLD = Decimal("1.05")   # 5 % above expected (Decimal for fractional comparison)


# ---------------------------------------------------------------------------
# Core calculation
# ---------------------------------------------------------------------------

def compute_budget_pacing(budget: Budget, now: Optional[datetime] = None) -> dict:
    """
    Compute pacing metrics for a single budget row.

    Returns a dict with:
        month_progress_percentage  (Decimal 0-100)
        expected_spend             (Decimal)
        is_over_pacing             (bool)
        pacing_status              (str: "over_pacing" | "under_pacing" | "on_track")
        remaining                  (Decimal — budget.amount - budget.spent)
    """
    if now is None:
        now = datetime.now(timezone.utc)

    amount = budget.amount
    spent  = budget.spent

    # --- month progress ---------------------------------------------------
    budget_year  = budget.year
    budget_month = budget.month

    if (budget_year, budget_month) < (now.year, now.month):
        # Past month → 100 %
        month_progress = Decimal("100")
    elif (budget_year, budget_month) > (now.year, now.month):
        # Future month → 0 %
        month_progress = Decimal("0")
    else:
        # Current month
        total_days = calendar.monthrange(budget_year, budget_month)[1]
        current_day = now.day
        month_progress = (Decimal(current_day) / Decimal(total_days) * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        month_progress = min(month_progress, Decimal("100"))

    # --- expected spend ---------------------------------------------------
    if amount == 0:
        expected_spend = 0
    else:
        expected_spend = int((Decimal(amount) * month_progress / Decimal("100")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        ))

    # --- pacing status ----------------------------------------------------
    if expected_spend == 0:
        # Nothing expected yet (future month or zero-amount budget)
        if spent > 0:
            is_over_pacing = True
            pacing_status = "over_pacing"
        else:
            is_over_pacing = False
            pacing_status = "on_track"
    else:
        if Decimal(spent) > Decimal(expected_spend) * _OVER_PACING_THRESHOLD:
            is_over_pacing = True
            pacing_status = "over_pacing"
        elif Decimal(spent) < Decimal(expected_spend) * Decimal("0.95"):
            is_over_pacing = False
            pacing_status = "under_pacing"
        else:
            is_over_pacing = False
            pacing_status = "on_track"

    remaining = amount - spent

    return {
        "month_progress_percentage": month_progress,
        "expected_spend": expected_spend,
        "is_over_pacing": is_over_pacing,
        "pacing_status": pacing_status,
        "remaining": remaining,
    }


def enrich_budget_response(budget: Budget, now: Optional[datetime] = None) -> dict:
    """
    Build a full budget response dict including pacing fields.
    This is the single source of truth that every endpoint should use.
    """
    pacing = compute_budget_pacing(budget, now)

    return {
        "id": budget.id,
        "name": budget.name,
        "amount": budget.amount,
        "spent": budget.spent,
        "month": budget.month,
        "year": budget.year,
        "category_id": budget.category_id,
        # Pacing fields (Decimal → float at JSON boundary)
        "month_progress_percentage": float(pacing["month_progress_percentage"]),
        "expected_spend": pacing["expected_spend"],
        "is_over_pacing": pacing["is_over_pacing"],
        "pacing_status": pacing["pacing_status"],
        "remaining": pacing["remaining"],
    }
