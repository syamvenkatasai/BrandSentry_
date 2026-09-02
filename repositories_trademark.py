from typing import List
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.models.brand import MarketBrand, TrademarkRegistry


class TrademarkRepository:
    """Read access to the Tier-1 registry/market reference tables. Both are
    empty until a real registry-import pipeline exists (see model docstrings) —
    callers must treat an empty result as "not loaded yet", never as a
    clearance signal."""

    def __init__(self, db: Session):
        self.db = db

    def get_all_trademarks(self) -> List[TrademarkRegistry]:
        return self.db.query(TrademarkRegistry).all()

    def get_all_market_brands(self) -> List[MarketBrand]:
        return self.db.query(MarketBrand).all()

    def find_by_active_ingredient(self, ingredient: str) -> List[TrademarkRegistry]:
        if not ingredient or not ingredient.strip():
            return []
        needle = f"%{ingredient.strip().lower()}%"
        return (
            self.db.query(TrademarkRegistry)
            .filter(func.lower(TrademarkRegistry.active_ingredient).like(needle))
            .all()
        )

    def find_market_by_active_ingredient(self, ingredient: str) -> List[MarketBrand]:
        if not ingredient or not ingredient.strip():
            return []
        needle = f"%{ingredient.strip().lower()}%"
        return (
            self.db.query(MarketBrand)
            .filter(
                or_(
                    func.lower(MarketBrand.active_ingredient).like(needle),
                    func.lower(MarketBrand.brand_name).like(needle),
                )
            )
            .all()
        )
