"""Production settings validation without developer environment files."""

import os
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.config import Settings


class ProductionConfigTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_local_defaults_and_explicit_cors_opt_in(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.APP_ENV, "development")
        self.assertIsNone(settings.origin_regex)
        self.assertIn("http://localhost:3000", settings.origins)
        self.assertEqual(Settings(_env_file=None, ALLOWED_ORIGIN_REGEX="local").origin_regex, "local")

    def test_production_rejects_missing_blank_short_and_default_secret_safely(self):
        for secret in (None, "", "   ", "private-test-secret", "x" * 31,
                       Settings.model_fields["JWT_SECRET"].default):
            with self.subTest(secret_length=len(secret or "")):
                kwargs = {} if secret is None else {"JWT_SECRET": secret}
                with self.assertRaises(ValidationError) as raised:
                    Settings(_env_file=None, APP_ENV="production", **kwargs)
                self.assertIn("Production requires", str(raised.exception))
                if secret and secret.strip():
                    self.assertNotIn(secret, str(raised.exception))

    def test_production_accepts_explicit_long_secret_and_rejects_unknown_environment(self):
        self.assertEqual(Settings(_env_file=None, APP_ENV="production", JWT_SECRET="x" * 32).APP_ENV,
                         "production")
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, APP_ENV="staging")


if __name__ == "__main__":
    unittest.main()
