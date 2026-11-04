"""Single-use relay tickets and job-scope ownership for the progress WebSocket.

Browsers cannot attach an ``Authorization`` header to a WebSocket handshake, so
the relay authenticates with a ticket fetched over the normal authenticated
HTTP API. The server (never the browser) chooses the ``client_id`` and binds it
to the caller for the life of the relay session.

State lives in this process: the dev/desktop deployment runs a single uvicorn
worker, and every ticket is minted and consumed inside that process. Tickets
are short-lived by design, so a restart only forces the client to mint a new
one. Nothing here touches ComfyUI or the database, which keeps the pure
filtering/ticket logic unit-testable without either.
"""

from __future__ import annotations

import json
import secrets
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, FrozenSet

# Ticket lifetime: long enough for one fetch + connect, short enough that a
# leaked URL is not useful.
TICKET_TTL_SECONDS = 30
# How long a server-issued client id stays usable for submission. Must exceed
# a full generation (COMFY_TIMEOUT defaults to 1800 s).
SESSION_TTL_SECONDS = 3600

# WebSocket close codes surfaced to the browser.
CLOSE_UNAUTHORIZED = 4401  # missing / unknown ticket
CLOSE_FORBIDDEN = 4403  # replayed ticket, foreign owner, disallowed origin
CLOSE_EXPIRED = 4408  # ticket or relay session expired


class ProgressTicketError(Exception):
    """A relay ticket could not be redeemed; carries the socket close code."""

    def __init__(self, reason: str, close_code: int) -> None:
        super().__init__(reason)
        self.reason = reason
        self.close_code = close_code


class ProgressScopeError(Exception):
    """A submitted ``client_id`` is unknown, expired, or owned by someone else."""


@dataclass(frozen=True)
class TicketGrant:
    ticket: str
    client_id: str
    user_id: str
    expires_in_seconds: int


@dataclass
class _Ticket:
    client_id: str
    user_id: str
    expires_at: float


@dataclass
class _Session:
    client_id: str
    user_id: str
    expires_at: float
    prompt_ids: set[str] = field(default_factory=set)
    # One execution may own the scope; a second submission with the same id is
    # rejected so two job streams can never be merged under one relay.
    claimed: bool = False


class ProgressRegistry:
    """Issues tickets and tracks which prompt ids a relay session may see."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._tickets: dict[str, _Ticket] = {}
        self._used_tickets: dict[str, float] = {}
        self._sessions: dict[str, _Session] = {}

    # -- Tickets --------------------------------------------------------- #

    def issue_ticket(self, user_id: str) -> TicketGrant:
        """Mint a one-use ticket and reserve a server-chosen client id."""
        token = secrets.token_urlsafe(32)
        client_id = uuid.uuid4().hex
        now = self._clock()
        with self._lock:
            self._prune_locked(now)
            self._tickets[token] = _Ticket(
                client_id=client_id,
                user_id=user_id,
                expires_at=now + TICKET_TTL_SECONDS,
            )
            self._sessions[client_id] = _Session(
                client_id=client_id,
                user_id=user_id,
                expires_at=now + SESSION_TTL_SECONDS,
            )
        return TicketGrant(
            ticket=token,
            client_id=client_id,
            user_id=user_id,
            expires_in_seconds=TICKET_TTL_SECONDS,
        )

    def consume_ticket(self, ticket: str | None) -> TicketGrant:
        """Redeem a ticket exactly once, returning its server-issued binding."""
        if not ticket or not ticket.strip():
            raise ProgressTicketError("missing ticket", CLOSE_UNAUTHORIZED)
        token = ticket.strip()
        now = self._clock()
        with self._lock:
            # A redeemed ticket is remembered briefly so a replay reports
            # "already used" rather than "unknown".
            if token in self._used_tickets:
                raise ProgressTicketError("ticket already used", CLOSE_FORBIDDEN)
            found = self._tickets.get(token)
            if found is None:
                raise ProgressTicketError("unknown ticket", CLOSE_UNAUTHORIZED)
            if now > found.expires_at:
                del self._tickets[token]
                raise ProgressTicketError("ticket expired", CLOSE_EXPIRED)
            session = self._sessions.get(found.client_id)
            if session is None or now > session.expires_at:
                raise ProgressTicketError("relay session expired", CLOSE_EXPIRED)
            del self._tickets[token]
            self._used_tickets[token] = now
            return TicketGrant(
                ticket=token,
                client_id=found.client_id,
                user_id=found.user_id,
                expires_in_seconds=0,
            )

    # -- Submission binding ---------------------------------------------- #

    def claim_client_id(self, requested: str | None, user_id: str) -> str:
        """Atomically claim the ComfyUI client id one submission may use.

        An omitted id gets a fresh internal id with no relay (nothing is
        subscribed to it). A supplied id is only honoured when the server
        issued it, it is still bound to this user, and it has not already been
        claimed by another execution; a browser value that was never reserved
        is rejected, never trusted. Ticket redemption does not claim the
        scope, so opening the relay before submitting still works.
        """
        if not requested:
            return uuid.uuid4().hex
        now = self._clock()
        with self._lock:
            session = self._sessions.get(requested)
            if session is None:
                raise ProgressScopeError("Unknown or expired relay session")
            if now > session.expires_at:
                del self._sessions[requested]
                raise ProgressScopeError("Relay session expired")
            if session.user_id != user_id:
                raise ProgressScopeError("Relay session belongs to another user")
            if session.claimed:
                raise ProgressScopeError("Relay session already used by a running job")
            session.claimed = True
            return requested

    def register_prompt(self, client_id: str, prompt_id: str) -> None:
        """Record that ``prompt_id`` was queued for this relay session."""
        if not client_id or not prompt_id:
            return
        now = self._clock()
        with self._lock:
            session = self._sessions.get(client_id)
            if session is None or not session.claimed or now > session.expires_at:
                return
            session.prompt_ids.add(prompt_id)

    def allowed_prompt_ids(self, client_id: str) -> FrozenSet[str]:
        """Prompt ids this relay session may forward; empty means forward none."""
        now = self._clock()
        with self._lock:
            session = self._sessions.get(client_id)
            if session is None or now > session.expires_at:
                return frozenset()
            return frozenset(session.prompt_ids)

    def release_client(self, client_id: str) -> None:
        """Drop an unclaimed session when its relay socket closes.

        A claimed session keeps its prompt allowlist until the execution
        finishes (``register_prompt``/``claim``), so a relay reconnect within
        the same run cannot lose the stream it was already reading.
        """
        with self._lock:
            session = self._sessions.get(client_id)
            if session is not None and not session.claimed:
                del self._sessions[client_id]

    # -- Housekeeping ---------------------------------------------------- #

    def prune(self) -> None:
        """Drop expired tickets, replay tombstones, and sessions."""
        with self._lock:
            self._prune_locked(self._clock())

    def _prune_locked(self, now: float) -> None:
        # Keep expired tickets for one extra TTL so consume_ticket can still
        # answer "expired" (4408) instead of "unknown" (4401).
        for token, ticket in list(self._tickets.items()):
            if ticket.expires_at < now - TICKET_TTL_SECONDS:
                del self._tickets[token]
        for token, used_at in list(self._used_tickets.items()):
            if used_at < now - TICKET_TTL_SECONDS:
                del self._used_tickets[token]
        for client_id, session in list(self._sessions.items()):
            if session.expires_at < now:
                del self._sessions[client_id]


def scope_relay_frame(
    raw: str | bytes | bytearray,
    allowed_prompt_ids: FrozenSet[str],
) -> str | None:
    """Return the frame to forward, or ``None`` when it must be dropped.

    ComfyUI broadcasts every client's events to every socket. Only structured
    JSON frames carrying a ``prompt_id`` this session queued are forwarded.
    Binary frames (live preview pixels) carry no prompt id at all, so they are
    always dropped rather than guessed at.
    """
    if not isinstance(raw, str) or not allowed_prompt_ids:
        return None
    try:
        message = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(message, dict):
        return None
    data = message.get("data")
    if not isinstance(data, dict):
        return None
    prompt_id = data.get("prompt_id")
    if not isinstance(prompt_id, str) or prompt_id not in allowed_prompt_ids:
        return None
    return raw


_registry: ProgressRegistry | None = None


def get_progress_registry() -> ProgressRegistry:
    global _registry
    if _registry is None:
        _registry = ProgressRegistry()
    return _registry


def set_progress_registry(registry: ProgressRegistry | None) -> None:
    """Swap the singleton (tests, or a controlled restart)."""
    global _registry
    _registry = registry
