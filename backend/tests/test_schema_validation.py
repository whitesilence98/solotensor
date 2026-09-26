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


if __name__ == "__main__":
    unittest.main()
