"""Unit tests for relay tickets, ownership binding, and frame scoping.

No ComfyUI, no network, no live database: the registry is driven by a manual
clock and frames are plain JSON strings.
"""

import json
import unittest

from app.services.progress_registry import (
    CLOSE_EXPIRED,
    CLOSE_FORBIDDEN,
    CLOSE_UNAUTHORIZED,
    ProgressRegistry,
    ProgressScopeError,
    ProgressTicketError,
    scope_relay_frame,
)


class ManualClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def frame(prompt_id, msg_type="progress"):
    return json.dumps(
        {"type": msg_type, "data": {"prompt_id": prompt_id, "value": 1, "max": 10}}
    )


class TestTicketLifecycle(unittest.TestCase):
    def setUp(self):
        self.clock = ManualClock()
        self.registry = ProgressRegistry(clock=self.clock)

    def test_issue_returns_server_client_id_and_ticket(self):
        grant = self.registry.issue_ticket("user-a")
        self.assertEqual(len(grant.client_id), 32)
        int(grant.client_id, 16)  # strict hex
        self.assertEqual(grant.expires_in_seconds, 30)
        self.assertTrue(grant.ticket)

    def test_ticket_is_single_use(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.consume_ticket(grant.ticket)
        with self.assertRaises(ProgressTicketError) as ctx:
            self.registry.consume_ticket(grant.ticket)
        self.assertEqual(ctx.exception.close_code, CLOSE_FORBIDDEN)

    def test_missing_and_unknown_ticket(self):
        for value in (None, "", "   "):
            with self.assertRaises(ProgressTicketError) as ctx:
                self.registry.consume_ticket(value)
            self.assertEqual(ctx.exception.close_code, CLOSE_UNAUTHORIZED)
        with self.assertRaises(ProgressTicketError) as ctx:
            self.registry.consume_ticket("nope")
        self.assertEqual(ctx.exception.close_code, CLOSE_UNAUTHORIZED)

    def test_expired_ticket(self):
        grant = self.registry.issue_ticket("user-a")
        self.clock.now += 31
        with self.assertRaises(ProgressTicketError) as ctx:
            self.registry.consume_ticket(grant.ticket)
        self.assertEqual(ctx.exception.close_code, CLOSE_EXPIRED)

    def test_ticket_binds_original_owner(self):
        grant = self.registry.issue_ticket("user-a")
        redeemed = self.registry.consume_ticket(grant.ticket)
        self.assertEqual(redeemed.client_id, grant.client_id)
        self.assertEqual(redeemed.user_id, "user-a")

    def test_prune_drops_stale_state(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.consume_ticket(grant.ticket)
        self.clock.now += 7200
        self.registry.prune()
        self.assertEqual(self.registry.allowed_prompt_ids(grant.client_id), frozenset())


class TestSubmissionBinding(unittest.TestCase):
    def setUp(self):
        self.clock = ManualClock()
        self.registry = ProgressRegistry(clock=self.clock)

    def test_omitted_client_id_is_server_internal(self):
        internal = self.registry.claim_client_id(None, "user-a")
        self.assertEqual(len(internal), 32)
        self.assertNotEqual(internal, self.registry.claim_client_id(None, "user-a"))

    def test_supplied_reserved_id_is_honoured_for_owner(self):
        grant = self.registry.issue_ticket("user-a")
        resolved = self.registry.claim_client_id(grant.client_id, "user-a")
        self.assertEqual(resolved, grant.client_id)

    def test_ticket_use_does_not_claim_scope(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.consume_ticket(grant.ticket)
        self.assertEqual(
            self.registry.claim_client_id(grant.client_id, "user-a"), grant.client_id
        )

    def test_second_claim_is_rejected(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.claim_client_id(grant.client_id, "user-a")
        with self.assertRaises(ProgressScopeError):
            self.registry.claim_client_id(grant.client_id, "user-a")

    def test_supplied_unreserved_id_is_rejected(self):
        with self.assertRaises(ProgressScopeError):
            self.registry.claim_client_id("f" * 32, "user-a")

    def test_foreign_owner_is_rejected(self):
        grant = self.registry.issue_ticket("user-a")
        with self.assertRaises(ProgressScopeError):
            self.registry.claim_client_id(grant.client_id, "user-b")

    def test_expired_session_is_rejected(self):
        grant = self.registry.issue_ticket("user-a")
        self.clock.now += 3601
        with self.assertRaises(ProgressScopeError):
            self.registry.claim_client_id(grant.client_id, "user-a")

    def test_multi_stage_registers_multiple_prompts(self):
        grant = self.registry.issue_ticket("user-a")
        client_id = self.registry.claim_client_id(grant.client_id, "user-a")
        self.registry.register_prompt(client_id, "stage-1")
        self.registry.register_prompt(client_id, "stage-2")
        self.assertEqual(
            self.registry.allowed_prompt_ids(client_id), frozenset({"stage-1", "stage-2"})
        )

    def test_unclaimed_session_registers_nothing(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.register_prompt(grant.client_id, "sneaky")
        self.assertEqual(self.registry.allowed_prompt_ids(grant.client_id), frozenset())

    def test_release_keeps_claimed_scope(self):
        grant = self.registry.issue_ticket("user-a")
        client_id = self.registry.claim_client_id(grant.client_id, "user-a")
        self.registry.register_prompt(client_id, "running")
        self.registry.release_client(client_id)
        self.assertEqual(self.registry.allowed_prompt_ids(client_id), frozenset({"running"}))


class TestFrameScope(unittest.TestCase):
    def setUp(self):
        self.clock = ManualClock()
        self.registry = ProgressRegistry(clock=self.clock)
        self.grant = self.registry.issue_ticket("user-a")
        self.registry.claim_client_id(self.grant.client_id, "user-a")
        self.registry.register_prompt(self.grant.client_id, "prompt-owned")

    def test_own_prompt_frames_forward(self):
        allowed = self.registry.allowed_prompt_ids(self.grant.client_id)
        for msg_type in ("progress", "executing", "executed", "execution_success"):
            forwarded = scope_relay_frame(frame("prompt-owned", msg_type), allowed)
            self.assertIsNotNone(forwarded)

    def test_other_prompt_frames_dropped(self):
        allowed = self.registry.allowed_prompt_ids(self.grant.client_id)
        self.assertIsNone(scope_relay_frame(frame("prompt-other"), allowed))

    def test_unscoped_status_dropped(self):
        allowed = self.registry.allowed_prompt_ids(self.grant.client_id)
        status = json.dumps({"type": "status", "data": {"status": {"queue_remaining": 1}}})
        self.assertIsNone(scope_relay_frame(status, allowed))
        no_data = json.dumps({"type": "executing", "data": {"node": "1"}})
        self.assertIsNone(scope_relay_frame(no_data, allowed))

    def test_all_binary_frames_dropped(self):
        allowed = self.registry.allowed_prompt_ids(self.grant.client_id)
        self.assertIsNone(scope_relay_frame(b"\x89PNG-preview", allowed))

    def test_malformed_frames_dropped(self):
        allowed = self.registry.allowed_prompt_ids(self.grant.client_id)
        for raw in ("not json", "[]", json.dumps({"data": "nope"})):
            self.assertIsNone(scope_relay_frame(raw, allowed))

    def test_no_registered_prompt_forwards_nothing(self):
        grant = self.registry.issue_ticket("user-b")
        allowed = self.registry.allowed_prompt_ids(grant.client_id)
        self.assertEqual(allowed, frozenset())
        self.assertIsNone(scope_relay_frame(frame("prompt-owned"), allowed))

    def test_unknown_session_forwards_nothing(self):
        self.assertEqual(self.registry.allowed_prompt_ids("0" * 32), frozenset())


if __name__ == "__main__":
    unittest.main()
