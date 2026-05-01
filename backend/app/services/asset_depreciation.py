"""
Asset Depreciation Service
Calculates current asset value using straight-line depreciation
Precision: multiply first, divide later to avoid cent loss
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.asset import Asset


class AssetValueResult:
    def __init__(
        self,
        asset_id: str,
        asset_name: str,
        purchase_price_cents: int,
        current_value_cents: int,
        depreciation_accumulated_cents: int,
        months_elapsed: int,
        is_fully_depreciated: bool,
    ):
        self.asset_id = asset_id
        self.asset_name = asset_name
        self.purchase_price_cents = purchase_price_cents
        self.current_value_cents = current_value_cents
        self.depreciation_accumulated_cents = depreciation_accumulated_cents
        self.months_elapsed = months_elapsed
        self.is_fully_depreciated = is_fully_depreciated

    def to_dict(self):
        return {
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "purchase_price_cents": self.purchase_price_cents,
            "current_value_cents": self.current_value_cents,
            "depreciation_accumulated_cents": self.depreciation_accumulated_cents,
            "months_elapsed": self.months_elapsed,
            "is_fully_depreciated": self.is_fully_depreciated,
        }


class AssetDepreciationService:
    """
    Calculate current value of an asset at a given date
    Formula: current_value = purchase_price - ((purchase_price - residual) * months_elapsed / life_months)
    Precision: multiply first, divide later
    """

    @staticmethod
    def calculate_months_elapsed(start_date: datetime, end_date: datetime) -> int:
        """Calculate months elapsed between two dates"""
        start_year = start_date.year
        start_month = start_date.month
        end_year = end_date.year
        end_month = end_date.month

        return (end_year - start_year) * 12 + (end_month - start_month)

    @staticmethod
    def calculate_current_value(
        db: Session, asset_id: str, as_of_date: Optional[datetime] = None
    ) -> AssetValueResult:
        """Calculate current value of an asset at a given date"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()

        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        if not asset or asset.is_deleted:
            raise ValueError(f"Asset not found: {asset_id}")

        purchase_date = datetime.fromisoformat(asset.purchase_date) if isinstance(asset.purchase_date, str) else asset.purchase_date
        months_elapsed = AssetDepreciationService.calculate_months_elapsed(purchase_date, as_of_date)

        # Base depreciable: purchase_price - residual_value
        depreciable_base = asset.purchase_price_cents - asset.residual_value_cents

        current_value: int
        depreciation_accumulated: int
        is_fully_depreciated = False

        if months_elapsed >= asset.estimated_life_months:
            # Asset fully depreciated - value = residual_value (minimum, never negative)
            current_value = asset.residual_value_cents
            depreciation_accumulated = depreciable_base
            is_fully_depreciated = True
        else:
            # Precision: multiply first, divide later to avoid cent loss
            # depreciation = (depreciable_base * months_elapsed) / estimated_life_months
            depreciation = (depreciable_base * months_elapsed) // asset.estimated_life_months
            current_value = asset.purchase_price_cents - depreciation
            depreciation_accumulated = depreciation

            # Safety: ensure current value never below residual
            if current_value < asset.residual_value_cents:
                current_value = asset.residual_value_cents
                depreciation_accumulated = depreciable_base
                is_fully_depreciated = True

        return AssetValueResult(
            asset_id=asset.id,
            asset_name=asset.name,
            purchase_price_cents=asset.purchase_price_cents,
            current_value_cents=current_value,
            depreciation_accumulated_cents=depreciation_accumulated,
            months_elapsed=months_elapsed,
            is_fully_depreciated=is_fully_depreciated,
        )

    @staticmethod
    def get_total_assets_value(
        db: Session, as_of_date: Optional[datetime] = None
    ) -> int:
        """Calculate total current value of all assets at a given date"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()

        assets = db.query(Asset).filter(Asset.is_deleted == False).all()
        total_value = 0

        for asset in assets:
            result = AssetDepreciationService.calculate_current_value(db, asset.id, as_of_date)
            total_value += result.current_value_cents

        return total_value

    @staticmethod
    def get_all_assets_with_values(
        db: Session, as_of_date: Optional[datetime] = None
    ) -> List[dict]:
        """Get all assets with their current values"""
        if as_of_date is None:
            as_of_date = datetime.utcnow()

        assets = db.query(Asset).filter(Asset.is_deleted == False).all()
        results = []

        for asset in assets:
            value = AssetDepreciationService.calculate_current_value(db, asset.id, as_of_date)
            results.append(value.to_dict())

        return results


# Singleton instance
asset_depreciation_service = AssetDepreciationService()
