"""SoloTensor Credit / Energy Service (TensorArt pattern).

Every user receives 100 daily energy credits that automatically replenish
after 24 hours. Users can also manually claim their daily recharge.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Optional

from ..config import Settings, get_settings
from ..db import Database, get_db
from ..schemas import UserCreditsResponse

logger = logging.getLogger("solotensor.credits")
DAILY_RESET_SECONDS = 86400  # 24 hours


def _parse_timestamp(val: Any) -> datetime:
    """Parse timestamp into UTC-aware datetime."""
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        val = val.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(val)
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)


class CreditService:
    """Manages user credits, daily allowance replenishment, and deduction."""

    def __init__(self, db: Optional[Database] = None, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.db = db or get_db()

    def init_user_credits(
        self,
        user_id: str,
        balance: Optional[int] = None,
        daily_allowance: Optional[int] = None,
    ) -> dict[str, Any]:
        """Initialize a new user's credit record with default allowance."""
        initial_balance = (
            balance if balance is not None else self.settings.DEFAULT_DAILY_CREDITS
        )
        allowance = (
            daily_allowance
            if daily_allowance is not None
            else self.settings.DEFAULT_DAILY_CREDITS
        )
        now = datetime.now(timezone.utc).isoformat()
        return self.db.create_credits(
            user_id=user_id,
            balance=initial_balance,
            daily_allowance=allowance,
            last_claimed_at=now,
            updated_at=now,
        )

    def get_user_credits(self, user_id: str, auto_replenish: bool = True) -> UserCreditsResponse:
        """Fetch credit balance, daily allowance, seconds until next reset, and claim eligibility.

        If 24h have elapsed and balance is below daily allowance, auto_replenish will
        restore the balance to the allowance.
        """
        row = self.db.get_credits(user_id)
        if not row:
            # Self-healing: if user exists but has no credit row, initialize
            row = self.init_user_credits(user_id)

        balance = int(row["balance"])
        allowance = int(row["daily_allowance"])
        last_claimed_raw = row["last_claimed_at"]
        last_claimed_dt = _parse_timestamp(last_claimed_raw)
        now = datetime.now(timezone.utc)
        elapsed = (now - last_claimed_dt).total_seconds()

        can_claim_daily = elapsed >= DAILY_RESET_SECONDS
        seconds_until_next_reset = max(0, int(DAILY_RESET_SECONDS - elapsed))

        # TensorArt auto-replenish pattern: if 24h passed and balance < allowance, auto-replenish to allowance
        if auto_replenish and can_claim_daily and balance < allowance:
            logger.info(
                "Auto-replenishing credits for user %s: %d -> %d (24h elapsed)",
                user_id,
                balance,
                allowance,
            )
            balance = allowance
            now_iso = now.isoformat()
            self.db.update_credits(
                user_id=user_id,
                balance=balance,
                last_claimed_at=now_iso,
                updated_at=now_iso,
            )
            last_claimed_raw = now_iso
            can_claim_daily = False
            seconds_until_next_reset = DAILY_RESET_SECONDS

        return UserCreditsResponse(
            user_id=user_id,
            balance=balance,
            daily_allowance=allowance,
            last_claimed_at=last_claimed_raw,
            last_daily_claim_at=last_claimed_raw,
            seconds_until_next_reset=seconds_until_next_reset,
            can_claim_daily=can_claim_daily,
        )

    def claim_daily_allowance(self, user_id: str) -> UserCreditsResponse:
        """User-triggered daily credit recharge."""
        # Check without auto_replenish so user gets to claim
        status = self.get_user_credits(user_id, auto_replenish=False)
        if not status.can_claim_daily:
            raise ValueError(
                f"Daily allowance already claimed. Next claim available in {status.seconds_until_next_reset} seconds."
            )

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        current_balance = status.balance
        allowance = status.daily_allowance

        # Refill to allowance; if user already saved up >= allowance, reward with extra allowance
        if current_balance < allowance:
            new_balance = allowance
        else:
            new_balance = current_balance + allowance

        self.db.update_credits(
            user_id=user_id,
            balance=new_balance,
            last_claimed_at=now_iso,
            updated_at=now_iso,
        )
        logger.info(
            "User %s claimed daily allowance: %d -> %d",
            user_id,
            current_balance,
            new_balance,
        )

        return UserCreditsResponse(
            user_id=user_id,
            balance=new_balance,
            daily_allowance=allowance,
            last_claimed_at=now_iso,
            last_daily_claim_at=now_iso,
            seconds_until_next_reset=DAILY_RESET_SECONDS,
            can_claim_daily=False,
        )

    def deduct_credits(self, user_id: str, amount: int = 2) -> bool:
        """Deduct credits for an inference run. Returns True if deducted, False if insufficient."""
        if amount <= 0:
            return True

        # First, ensure auto-replenish if 24h passed
        self.get_user_credits(user_id, auto_replenish=True)

        return self.db.deduct_credits(user_id=user_id, amount=amount)


_default_credit_service: Optional[CreditService] = None


def get_credit_service() -> CreditService:
    """Factory function returning the CreditService (parameterless for FastAPI Depends)."""
    global _default_credit_service
    if _default_credit_service is None:
        _default_credit_service = CreditService()
    return _default_credit_service


def set_credit_service(service: Optional[CreditService]) -> None:
    """Setter for testing and runtime mocks."""
    global _default_credit_service
    _default_credit_service = service
