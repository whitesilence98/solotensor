"""Authenticated progress relay: ticket minting and the browser WebSocket.

Browsers cannot set an ``Authorization`` header on a WebSocket handshake, so
the relay is authenticated with a single-use ticket fetched over the normal
bearer-protected HTTP API. The ticket names a server-chosen ``client_id`` that
is bound to the caller; the socket only ever sees ComfyUI frames whose
``prompt_id`` that client_id queued.
"""

from __future__ import annotations

import asyncio
import logging
import re

import websockets
from fastapi import APIRouter, Depends, WebSocket

from ..config import get_settings
from ..routers.auth import get_current_user
from ..schemas import ProgressTicketResponse, UserResponse
from ..services.progress_registry import (
    CLOSE_FORBIDDEN,
    CLOSE_UNAUTHORIZED,
    ProgressTicketError,
    get_progress_registry,
    scope_relay_frame,
)

logger = logging.getLogger("solotensor.router.ws")

router = APIRouter(tags=["progress"])


def _origin_allowed(origin: str | None) -> bool:
    """Reject a browser handshake from an origin outside ALLOWED_ORIGINS.

    A missing Origin (CLI clients, TestClient) is allowed: the one-use ticket
    is the credential, and this check only stops cross-site browser abuse.
    """
    if not origin:
        return True
    settings = get_settings()
    if origin.rstrip("/") in settings.origins:
        return True
    pattern = settings.origin_regex
    return bool(pattern and re.fullmatch(pattern, origin))


@router.post("/ticket", response_model=ProgressTicketResponse)
async def create_progress_ticket(
    user: UserResponse = Depends(get_current_user),
) -> ProgressTicketResponse:
    """Mint a 30-second single-use relay ticket bound to the caller."""
    grant = get_progress_registry().issue_ticket(user.id)
    return ProgressTicketResponse(
        ticket=grant.ticket,
        client_id=grant.client_id,
        expires_in_seconds=grant.expires_in_seconds,
        ws_path=f"/api/v1/ws/progress?ticket={grant.ticket}",
    )


async def _pump_upstream(websocket: WebSocket, upstream, client_id: str) -> None:
    """Forward only prompt-scoped text frames; drop everything else."""
    registry = get_progress_registry()
    async for raw in upstream:
        # Re-read per frame: a submission may register its prompt id after the
        # socket is already open. Only exact prompt_id matches are forwarded;
        # binary previews and unscoped status frames never are.
        frame = scope_relay_frame(raw, registry.allowed_prompt_ids(client_id))
        if frame is not None and not await _safe_send(websocket, frame):
            return


async def _wait_for_client_close(websocket: WebSocket) -> None:
    """Keep reading until the browser disconnects; the relay is one-way.

    A send on a closed socket can race this read, so every send is guarded.
    """
    while True:
        message = await websocket.receive()
        if message.get("type") == "websocket.disconnect":
            return


async def _safe_send(websocket: WebSocket, text: str) -> bool:
    try:
        await websocket.send_text(text)
        return True
    except Exception:  # noqa: BLE001 - peer already gone
        return False


async def _reject(websocket: WebSocket, code: int, reason: str) -> None:
    """Surface an app close code: Starlette only sends one after accept()."""
    try:
        await websocket.accept()
    except Exception:  # noqa: BLE001 - peer vanished before the handshake
        return
    try:
        await websocket.close(code=code, reason=reason)
    except Exception:  # noqa: BLE001
        pass


@router.websocket("/progress")
async def ws_progress(websocket: WebSocket) -> None:
    """Relay this session's ComfyUI execution events to the browser.

    Close codes: 4401 missing/unknown ticket, 4403 replayed ticket or
    disallowed Origin, 4408 expired ticket.
    """
    registry = get_progress_registry()
    try:
        if not _origin_allowed(websocket.headers.get("origin")):
            raise ProgressTicketError("origin not allowed", CLOSE_FORBIDDEN)
        grant = registry.consume_ticket(websocket.query_params.get("ticket"))
    except ProgressTicketError as exc:
        await _reject(websocket, exc.close_code, exc.reason)
        return
    except Exception as exc:  # noqa: BLE001 - a bad ticket must never 500
        logger.warning("Progress relay ticket check failed: %s", exc)
        await _reject(websocket, CLOSE_UNAUTHORIZED, "unauthorized")
        return

    client_id = grant.client_id
    settings = get_settings()
    # Connect upstream BEFORE accepting the browser. The client treats its
    # OPEN as "ready to submit", so accepting first would let a submission
    # queue before the relay is subscribed and lose the first events.
    try:
        upstream = await websockets.connect(
            f"{settings.comfy_ws}/ws?clientId={client_id}",
            max_size=64 * 1024 * 1024,
            ping_interval=30,
            ping_timeout=120,
        )
    except Exception as exc:  # noqa: BLE001 - ComfyUI down is a normal case
        logger.warning("Progress relay could not reach ComfyUI: %s", exc)
        await _reject(websocket, 1011, "relay upstream unavailable")
        registry.release_client(client_id)
        return

    try:
        await websocket.accept()
    except Exception as exc:  # noqa: BLE001 - browser dropped while connecting
        logger.info("Progress relay client left before accept: %s", exc)
        try:
            await upstream.close()
        except Exception:  # noqa: BLE001
            pass
        registry.release_client(client_id)
        return

    tasks = {
        asyncio.create_task(_pump_upstream(websocket, upstream, client_id)),
        asyncio.create_task(_wait_for_client_close(websocket)),
    }
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc and not isinstance(exc, asyncio.CancelledError):
                logger.warning("Progress relay closed with error: %s", exc)
    finally:
        # Cancel and await every relay task here, so their cleanup runs before
        # the sockets close and never leaks as an unobserved task.
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            await upstream.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
        registry.release_client(client_id)
