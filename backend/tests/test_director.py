"""Creative-director service and route tests. No network, no real API key."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx
from fastapi.testclient import TestClient

import app.main as main_module
from app.config import Settings
from app.main import app
from app.schemas import DirectorMessage, DirectorReply, DirectorRole
from app.services.director import (
    DIRECTOR_SYSTEM_PROMPT,
    DirectorRateLimited,
    DirectorService,
    DirectorUnavailable,
    DirectorUpstreamError,
)

def _settings(**overrides: object) -> Settings:
    base = {
        "DIRECTOR_ENABLED": True,
        "DIRECTOR_PROVIDER": "local",
        "DIRECTOR_MODEL": "",
        "LOCAL_LLM_MODEL": "llama3",
        "LOCAL_LLM_URL": "http://local.test:1234",
    }
    base.update(overrides)
    return Settings(**base)

def _user_turn(text: str = "Plan a rainy rooftop shot.") -> list[DirectorMessage]:
    return [DirectorMessage(role=DirectorRole.USER, content=text)]

def _fake_http_response(status_code: int = 200, payload: object = None) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code

    def _raise() -> None:
        if status_code >= 400:
            request = httpx.Request("POST", "http://local.test/v1/chat/completions")
            raise httpx.HTTPStatusError(
                "error", request=request, response=httpx.Response(status_code, request=request)
            )

    response.raise_for_status.side_effect = _raise
    response.json.return_value = payload
    return response

class _FakeAsyncClient:
    """Stand-in for httpx.AsyncClient; records the posted payload."""

    posts: list[dict] = []
    outcome: object = None

    def __init__(self, *args: object, **kwargs: object) -> None:
        self.url: str | None = None
        self.json: object = None

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    async def post(self, url: str, json: object = None) -> object:
        self.url = url
        self.json = json
        _FakeAsyncClient.posts.append({"url": url, "json": json})
        outcome = _FakeAsyncClient.outcome
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

def _fake_client_factory(outcome: object):
    _FakeAsyncClient.posts = []
    _FakeAsyncClient.outcome = outcome
    return _FakeAsyncClient

class DirectorLocalReplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_reply_strips_answer_and_sends_system_prompt(self) -> None:
        service = DirectorService(_settings())
        response = _fake_http_response(
            200, {"choices": [{"message": {"content": "  A shot.  "}}]}
        )
        factory = _fake_client_factory(response)

        with patch("app.services.director.httpx.AsyncClient", factory):
            reply = await service._reply_local(_user_turn())

        self.assertEqual(reply.answer, "A shot.")
        self.assertEqual(reply.provider, "local")
        self.assertEqual(reply.model, "llama3")
        payload = _FakeAsyncClient.posts[0]["json"]
        self.assertEqual(payload["messages"][0], {"role": "system", "content": DIRECTOR_SYSTEM_PROMPT})
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "Plan a rainy rooftop shot."})
        self.assertEqual(_FakeAsyncClient.posts[0]["url"], "http://local.test:1234/v1/chat/completions")

    async def test_local_connect_error_is_unavailable(self) -> None:
        service = DirectorService(_settings())
        factory = _fake_client_factory(httpx.ConnectError("refused"))
        with patch("app.services.director.httpx.AsyncClient", factory):
            with self.assertRaises(DirectorUnavailable):
                await service._reply_local(_user_turn())

    async def test_local_timeout_is_upstream_error(self) -> None:
        service = DirectorService(_settings())
        factory = _fake_client_factory(httpx.TimeoutException("slow"))
        with patch("app.services.director.httpx.AsyncClient", factory):
            with self.assertRaises(DirectorUpstreamError):
                await service._reply_local(_user_turn())

    async def test_local_500_is_upstream_error(self) -> None:
        service = DirectorService(_settings())
        factory = _fake_client_factory(_fake_http_response(500, {"error": "boom"}))
        with patch("app.services.director.httpx.AsyncClient", factory):
            with self.assertRaises(DirectorUpstreamError):
                await service._reply_local(_user_turn())

    async def test_local_empty_choices_is_upstream_error(self) -> None:
        service = DirectorService(_settings())
        factory = _fake_client_factory(_fake_http_response(200, {"choices": []}))
        with patch("app.services.director.httpx.AsyncClient", factory):
            with self.assertRaises(DirectorUpstreamError):
                await service._reply_local(_user_turn())

class DirectorDefaultProviderTests(unittest.TestCase):
    def test_falls_back_to_anthropic_when_local_model_unset(self) -> None:
        service = DirectorService(
            _settings(DIRECTOR_PROVIDER="local", LOCAL_LLM_MODEL="", DIRECTOR_MODEL="claude-opus-5-5")
        )
        self.assertEqual(service._default_provider(), "anthropic")

class DirectorRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.service = DirectorService(_settings())

    def _patch_globals(self, enabled: bool = True):
        return patch.multiple(
            main_module,
            settings=Settings(DIRECTOR_ENABLED=enabled),
            director=self.service,
        )

    def test_disabled_post_returns_503(self) -> None:
        with self._patch_globals(enabled=False):
            response = self.client.post(
                "/api/v1/director",
                json={"messages": [{"role": "user", "content": "hi"}]},
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("DIRECTOR_ENABLED", response.json()["detail"])

    def test_disabled_providers_returns_503(self) -> None:
        with self._patch_globals(enabled=False):
            response = self.client.get("/api/v1/director/providers")
        self.assertEqual(response.status_code, 503)
        self.assertIn("DIRECTOR_ENABLED", response.json()["detail"])

    def test_providers_report_local_available(self) -> None:
        service = DirectorService(_settings(LOCAL_LLM_MODEL="llama3", DIRECTOR_MODEL=""))
        with patch.multiple(
            main_module,
            settings=Settings(DIRECTOR_ENABLED=True),
            director=service,
        ):
            response = self.client.get("/api/v1/director/providers")
        self.assertEqual(response.status_code, 200)
        by_id = {item["id"]: item for item in response.json()}
        self.assertTrue(by_id["local"]["available"])
        self.assertFalse(by_id["anthropic"]["available"])

    def test_post_returns_patched_local_reply(self) -> None:
        expected = DirectorReply(provider="local", model="m", answer="A shot.")
        self.service._reply_local = AsyncMock(return_value=expected)
        with self._patch_globals():
            response = self.client.post(
                "/api/v1/director",
                json={"provider": "local", "messages": [{"role": "user", "content": "hi"}]},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"provider": "local", "model": "m", "answer": "A shot."}
        )

    def test_anthropic_rate_limit_returns_429(self) -> None:
        self._assert_anthropic_error_status(
            anthropic.RateLimitError(
                "rate limited",
                response=httpx.Response(429, request=httpx.Request("POST", "http://x")),
                body=None,
            ),
            429,
        )

    def test_anthropic_connection_error_returns_502(self) -> None:
        self._assert_anthropic_error_status(
            anthropic.APIConnectionError(request=httpx.Request("POST", "http://x")), 502
        )

    def test_anthropic_auth_error_returns_503(self) -> None:
        self._assert_anthropic_error_status(
            anthropic.AuthenticationError(
                "bad key",
                response=httpx.Response(401, request=httpx.Request("POST", "http://x")),
                body=None,
            ),
            503,
        )

    def _assert_anthropic_error_status(self, exc: BaseException, status: int) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=exc)
        service = DirectorService(
            _settings(DIRECTOR_PROVIDER="anthropic", DIRECTOR_MODEL="claude-opus-5-5"),
            anthropic_client=client,
        )
        with patch.multiple(
            main_module,
            settings=Settings(DIRECTOR_ENABLED=True),
            director=service,
        ):
            response = self.client.post(
                "/api/v1/director",
                json={"provider": "anthropic", "messages": [{"role": "user", "content": "hi"}]},
            )
        self.assertEqual(response.status_code, status, response.text)

class DirectorValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def _post(self, body: dict) -> int:
        with patch.object(main_module, "settings", Settings(DIRECTOR_ENABLED=True)):
            return self.client.post("/api/v1/director", json=body).status_code

    def test_too_many_messages_rejected(self) -> None:
        body = {"messages": [{"role": "user", "content": "x"}] * 41}
        self.assertEqual(self._post(body), 422)

    def test_empty_content_rejected(self) -> None:
        self.assertEqual(self._post({"messages": [{"role": "user", "content": ""}]}), 422)

    def test_bogus_provider_rejected(self) -> None:
        self.assertEqual(
            self._post({"provider": "bogus", "messages": [{"role": "user", "content": "x"}]}),
            422,
        )

if __name__ == "__main__":
    unittest.main()
