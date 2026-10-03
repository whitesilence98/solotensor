import unittest
from types import SimpleNamespace

from app.config import Settings
from app.schemas import AssistantPersona
from app.services.code_assistant import CodeAssistantService


class FakeMessages:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return self.response


class CodeAssistantServiceTests(unittest.IsolatedAsyncioTestCase):
    def service(self, response: object) -> tuple[CodeAssistantService, FakeMessages]:
        messages = FakeMessages(response)
        client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
        return CodeAssistantService(Settings(ASSISTANT_ENABLED=True), client=client), messages

    async def test_uses_fixed_persona_context_without_tools(self) -> None:
        response = SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="thinking", text=""), SimpleNamespace(type="text", text="Use a schema.")],
        )
        service, messages = self.service(response)

        answer = await service.answer(AssistantPersona.BACKEND, "Add an endpoint")

        self.assertEqual(answer, "Use a schema.")
        request = messages.calls[0]
        self.assertEqual(request["messages"], [{"role": "user", "content": "Add an endpoint"}])
        self.assertNotIn("tools", request)
        self.assertIn("FastAPI", str(request["system"]))

    async def test_personas_select_distinct_instructions(self) -> None:
        response = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="OK")])
        service, messages = self.service(response)

        await service.answer(AssistantPersona.BACKEND, "Question")
        await service.answer(AssistantPersona.FRONTEND, "Question")

        self.assertNotEqual(messages.calls[0]["system"], messages.calls[1]["system"])

    async def test_refusal_returns_safe_message(self) -> None:
        response = SimpleNamespace(stop_reason="refusal", content=[])
        service, _ = self.service(response)

        answer = await service.answer(AssistantPersona.BACKEND, "Question")

        self.assertIn("cannot help", answer)


if __name__ == "__main__":
    unittest.main()
