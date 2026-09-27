import unittest

from pydantic import ValidationError

from app.schemas import GenerateRequest


class PromptValidationTests(unittest.TestCase):
    def test_accepts_one_thousand_words(self) -> None:
        request = GenerateRequest(prompt="word " * 1_000)
        self.assertEqual(len(request.prompt.split()), 1_000)

    def test_rejects_more_than_one_thousand_words(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="word " * 1_001)

    def test_accepts_ordered_loras(self) -> None:
        request = GenerateRequest(prompt="test", loras=[
            {"lora": "folder\\first.safetensors", "on": True, "strength": 0.75},
            {"lora": "second.safetensors", "on": False, "strength": -0.2},
        ])
        self.assertEqual(request.loras[0].lora, "folder\\first.safetensors")
        self.assertFalse(request.loras[1].on)

    def test_rejects_invalid_loras(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="test", loras=[{"lora": "", "strength": 1}])
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="test", loras=[{"lora": "a.safetensors", "strength": 11}])
        with self.assertRaises(ValidationError):
            GenerateRequest(prompt="test", loras=[{"lora": f"{index}.safetensors"} for index in range(17)])


if __name__ == "__main__":
    unittest.main()
