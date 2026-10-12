"""Comprehensive tests for SoloTensor authentication, user identity, credits, and API keys."""

from datetime import datetime, timedelta, timezone
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db
from app.main import app
from app.schemas import UserResponse
from app.services.auth_service import (
    LocalAuthProvider,
    SupabaseAuthProvider,
    UserAlreadyExistsError,
    get_auth_provider,
    hash_password,
    set_auth_provider,
    verify_password,
)
from app.services.credit_service import CreditService, get_credit_service, set_credit_service
from app.services.mailer_service import (
    MailerService,
    get_mailer_service,
    render_obsidian_template,
    set_mailer_service,
)


class DatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = f"{self.temp_dir.name}/test_solotensor.db"
        self.db = Database(db_path=self.db_path)
        self.db.init_db()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_schema_created_successfully(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row["name"] for row in cursor.fetchall()}
            self.assertIn("users", tables)
            self.assertIn("user_credits", tables)
            self.assertIn("api_keys", tables)
            self.assertIn("auth_tokens", tables)

    def test_create_and_fetch_user(self) -> None:
        user = self.db.create_user(
            user_id="user-123",
            email="test@example.com",
            username="testuser",
            hashed_password="hashed_pw_xyz",
            display_name="Test User",
        )
        self.assertEqual(user["id"], "user-123")
        self.assertEqual(user["email"], "test@example.com")
        self.assertEqual(user["username"], "testuser")

        by_id = self.db.get_user_by_id("user-123")
        self.assertIsNotNone(by_id)
        self.assertEqual(by_id["username"], "testuser")

        by_email = self.db.get_user_by_email("TEST@example.com")
        self.assertIsNotNone(by_email)
        self.assertEqual(by_email["id"], "user-123")

        by_username = self.db.get_user_by_username("TESTUSER")
        self.assertIsNotNone(by_username)
        self.assertEqual(by_username["id"], "user-123")

        by_identifier = self.db.get_user_by_email_or_username("testuser")
        self.assertIsNotNone(by_identifier)

    def test_credit_operations(self) -> None:
        self.db.create_user(
            user_id="user-credit",
            email="credits@example.com",
            username="credituser",
            hashed_password="pw",
        )
        credits = self.db.create_credits(user_id="user-credit", balance=100, daily_allowance=100)
        self.assertEqual(credits["balance"], 100)

        # Deduct
        deducted = self.db.deduct_credits("user-credit", amount=2)
        self.assertTrue(deducted)
        current = self.db.get_credits("user-credit")
        self.assertEqual(current["balance"], 98)

        # Try deducting more than available
        insufficient = self.db.deduct_credits("user-credit", amount=150)
        self.assertFalse(insufficient)
        current = self.db.get_credits("user-credit")
        self.assertEqual(current["balance"], 98)

    def test_auth_tokens_and_user_verification(self) -> None:
        user = self.db.create_user(
            user_id="user-tok",
            email="tokenuser@example.com",
            username="tokenuser",
            hashed_password="pw",
        )
        self.assertFalse(user["is_verified"])

        # Create token
        tok_data = self.db.create_auth_token("user-tok", token_type="email_verification", expires_in_seconds=3600)
        self.assertEqual(len(tok_data["otp_code"]), 6)
        self.assertTrue(tok_data["token"])

        # Fetch token
        found = self.db.get_auth_token(tok_data["token"], token_type="email_verification")
        self.assertIsNotNone(found)
        self.assertEqual(found["user_id"], "user-tok")

        # Fetch by OTP
        found_otp = self.db.get_auth_token_by_otp("user-tok", tok_data["otp_code"], token_type="email_verification")
        self.assertIsNotNone(found_otp)
        self.assertEqual(found_otp["token"], tok_data["token"])

        # Verify user
        verified = self.db.verify_user("user-tok")
        self.assertTrue(verified)
        u = self.db.get_user_by_id("user-tok")
        self.assertTrue(u["is_verified"])

        # Mark token used
        marked = self.db.mark_auth_token_used(tok_data["id"])
        self.assertTrue(marked)
        # Re-fetching should now return None
        self.assertIsNone(self.db.get_auth_token(tok_data["token"], token_type="email_verification"))

        # Update password
        updated_pw = self.db.update_user_password("user-tok", "new_hashed_pw")
        self.assertTrue(updated_pw)
        u_pw = self.db.get_user_by_id("user-tok")
        self.assertEqual(u_pw["hashed_password"], "new_hashed_pw")


class LocalAuthProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            DB_PATH=f"{self.temp_dir.name}/auth_test.db",
            JWT_SECRET="test-jwt-secret-12345",
        )
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_password_hashing_and_verification(self) -> None:
        raw_pw = "SuperSecret123!"
        hashed = hash_password(raw_pw)
        self.assertTrue(hashed.startswith("pbkdf2_sha256$100000$"))
        self.assertTrue(verify_password(raw_pw, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))
        self.assertFalse(verify_password("", hashed))

    def test_register_and_authenticate(self) -> None:
        user = self.provider.create_user(
            email="artist@solotensor.ai",
            username="tensor_artist",
            password="securePassword456",
            display_name="Tensor Artist",
        )
        self.assertEqual(user.username, "tensor_artist")
        self.assertEqual(user.role, "creator")

        # Duplicate email
        with self.assertRaises(UserAlreadyExistsError):
            self.provider.create_user(
                email="artist@solotensor.ai",
                username="another_user",
                password="pw",
            )

        # Duplicate username
        with self.assertRaises(UserAlreadyExistsError):
            self.provider.create_user(
                email="another@solotensor.ai",
                username="tensor_artist",
                password="pw",
            )

        # Authenticate by email
        auth1 = self.provider.authenticate("artist@solotensor.ai", "securePassword456")
        self.assertIsNotNone(auth1)
        self.assertEqual(auth1.id, user.id)

        # Authenticate by username
        auth2 = self.provider.authenticate("tensor_artist", "securePassword456")
        self.assertIsNotNone(auth2)
        self.assertEqual(auth2.id, user.id)

        # Wrong password
        auth_fail = self.provider.authenticate("tensor_artist", "wrongPassword")
        self.assertIsNone(auth_fail)

    def test_jwt_token_creation_and_verification(self) -> None:
        user = self.provider.create_user(
            email="jwt@example.com",
            username="jwtuser",
            password="password123",
        )
        token = self.provider.create_token(user)
        self.assertIsInstance(token, str)
        self.assertEqual(len(token.split(".")), 3)

        verified = self.provider.verify_token(token)
        self.assertIsNotNone(verified)
        self.assertEqual(verified.id, user.id)
        self.assertEqual(verified.username, "jwtuser")

        # Invalid token
        self.assertIsNone(self.provider.verify_token("invalid.token.here"))
        self.assertIsNone(self.provider.verify_token("not-even-a-jwt"))

    def test_api_key_management(self) -> None:
        user = self.provider.create_user(
            email="apikey@example.com",
            username="apikeyuser",
            password="password123",
        )
        resp, raw_key = self.provider.create_api_key(user.id, "CI Runner")
        self.assertTrue(raw_key.startswith("st_live_"))
        self.assertEqual(resp.name, "CI Runner")

        # Verify API key
        verified = self.provider.verify_api_key(raw_key)
        self.assertIsNotNone(verified)
        self.assertEqual(verified.id, user.id)

        # List keys
        keys = self.provider.list_api_keys(user.id)
        self.assertEqual(len(keys), 1)
        self.assertEqual(keys[0].name, "CI Runner")
        self.assertTrue(keys[0].masked_key.startswith("st_live_"))

        # Delete key
        deleted = self.provider.delete_api_key(user.id, resp.id)
        self.assertTrue(deleted)

        # Verify key no longer works
        self.assertIsNone(self.provider.verify_api_key(raw_key))


class CreditServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(DB_PATH=f"{self.temp_dir.name}/credits_test.db")
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        self.service = CreditService(db=self.db, settings=self.settings)
        self.user = self.db.create_user(
            user_id="user-energy",
            email="energy@example.com",
            username="energyuser",
            hashed_password="pw",
        )
        self.service.init_user_credits(self.user["id"])

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_initial_credits_and_reset_timer(self) -> None:
        stats = self.service.get_user_credits(self.user["id"])
        self.assertEqual(stats.balance, 100)
        self.assertEqual(stats.daily_allowance, 100)
        self.assertFalse(stats.can_claim_daily)
        self.assertGreater(stats.seconds_until_next_reset, 0)

    def test_deduct_credits(self) -> None:
        success = self.service.deduct_credits(self.user["id"], amount=2)
        self.assertTrue(success)
        stats = self.service.get_user_credits(self.user["id"])
        self.assertEqual(stats.balance, 98)

    def test_claim_daily_allowance_timing(self) -> None:
        # Immediately claiming should fail
        with self.assertRaises(ValueError):
            self.service.claim_daily_allowance(self.user["id"])

        # Simulate 25 hours elapsed
        past_time = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        self.db.update_credits(self.user["id"], balance=10, last_claimed_at=past_time)

        # Should be eligible to claim
        check = self.service.get_user_credits(self.user["id"], auto_replenish=False)
        self.assertTrue(check.can_claim_daily)
        self.assertEqual(check.seconds_until_next_reset, 0)

        # Claim recharge
        claimed = self.service.claim_daily_allowance(self.user["id"])
        self.assertEqual(claimed.balance, 100)  # Refilled from 10 to 100
        self.assertFalse(claimed.can_claim_daily)

    def test_auto_replenish_after_24h(self) -> None:
        # User exhausted energy to 0 credits 25 hours ago
        past_time = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        self.db.update_credits(self.user["id"], balance=0, last_claimed_at=past_time)

        # Fetching credits with auto_replenish=True automatically restores 100 credits
        stats = self.service.get_user_credits(self.user["id"], auto_replenish=True)
        self.assertEqual(stats.balance, 100)


class MailerServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_render_obsidian_template(self) -> None:
        html = render_obsidian_template(
            title="Verification Required",
            preheader="Preview code 123456",
            headline="Action Required",
            body_paragraphs=["Please verify your studio account."],
            action_label="Verify Now",
            action_url="http://localhost:3000/verify-email?token=abc",
            otp_code="123456",
            subtext="Code expires in 24h",
        )
        self.assertIn("#0a0b0a", html)
        self.assertIn("#121412", html)
        self.assertIn("#d5f06f", html)
        self.assertIn("#171b08", html)
        self.assertIn("#282c28", html)
        self.assertIn("123456", html)
        self.assertIn("SOLOTENSOR", html)

    async def test_mailer_service_dispatch(self) -> None:
        mailer = MailerService(Settings())
        success = await mailer.send_verification_email("user@test.com", "artist", "tok123", "654321")
        self.assertTrue(success)
        success_reset = await mailer.send_password_reset_email("user@test.com", "artist", "tok123", "654321")
        self.assertTrue(success_reset)


class AuthEndpointsAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            DB_PATH=f"{self.temp_dir.name}/api_test.db",
            JWT_SECRET="api-test-jwt-secret-xyz",
        )
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.mailer = MailerService(settings=self.settings)

        set_auth_provider(self.provider)
        set_credit_service(self.credits)
        set_mailer_service(self.mailer)

        app.dependency_overrides[get_db] = lambda: self.db

        self.client = TestClient(app)

    def tearDown(self) -> None:
        set_auth_provider(None)
        set_credit_service(None)
        set_mailer_service(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def test_register_login_flow(self) -> None:
        # 1. Register
        reg_payload = {
            "email": "creator@solotensor.ai",
            "username": "creator_pro",
            "password": "StrongPassword!2026",
            "display_name": "SoloTensor Creator Pro",
        }
        res = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["user"]["username"], "creator_pro")
        self.assertEqual(data["credits"]["balance"], 100)

        token = data["access_token"]

        # 2. Duplicate registration -> 409
        res_dup = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res_dup.status_code, 409)

        # 3. Login by username
        res_login_user = self.client.post(
            "/api/auth/login",
            json={"username": "creator_pro", "password": "StrongPassword!2026"},
        )
        self.assertEqual(res_login_user.status_code, 200)
        self.assertIn("access_token", res_login_user.json())

        # 4. Login by email
        res_login_email = self.client.post(
            "/api/auth/login",
            json={"email": "creator@solotensor.ai", "password": "StrongPassword!2026"},
        )
        self.assertEqual(res_login_email.status_code, 200)

        # 5. Login wrong password -> 401
        res_fail = self.client.post(
            "/api/auth/login",
            json={"username": "creator_pro", "password": "WrongPassword"},
        )
        self.assertEqual(res_fail.status_code, 401)

        # 6. /api/auth/me with Bearer Token
        res_me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_me.status_code, 200)
        me_data = res_me.json()
        self.assertEqual(me_data["username"], "creator_pro")
        self.assertEqual(me_data["credits"]["balance"], 100)

        # 7. /api/auth/credits
        res_credits = self.client.get("/api/auth/credits", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_credits.status_code, 200)
        self.assertEqual(res_credits.json()["balance"], 100)

        # 8. /api/auth/claim-daily (should fail within 24h)
        res_claim = self.client.post("/api/auth/claim-daily", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_claim.status_code, 400)

    def test_api_keys_flow(self) -> None:
        # Register user
        reg = self.client.post(
            "/api/auth/register",
            json={"email": "keyuser@test.com", "username": "keyuser", "password": "password123"},
        ).json()
        token = reg["access_token"]

        # Create API Key
        create_res = self.client.post(
            "/api/auth/keys",
            json={"name": "Dev Script"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(create_res.status_code, 201)
        key_data = create_res.json()
        raw_key = key_data["api_key"]
        key_id = key_data["id"]
        self.assertTrue(raw_key.startswith("st_live_"))

        # Use X-SoloTensor-Key header for authentication
        me_res = self.client.get("/api/auth/me", headers={"X-SoloTensor-Key": raw_key})
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["username"], "keyuser")

        # List keys
        list_res = self.client.get("/api/auth/keys", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 1)
        self.assertIn("masked_key", list_res.json()[0])

        # Delete key
        del_res = self.client.delete(f"/api/auth/keys/{key_id}", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["deleted"])

        # Key should now be rejected
        reject_res = self.client.get("/api/auth/me", headers={"X-SoloTensor-Key": raw_key})
        self.assertEqual(reject_res.status_code, 401)

    def test_generation_credit_deduction_and_guest_compatibility(self) -> None:
        # Register a creator
        reg = self.client.post(
            "/api/auth/register",
            json={"email": "gen@test.com", "username": "gencreator", "password": "password123"},
        ).json()
        token = reg["access_token"]
        user_id = reg["user"]["id"]

        # Mock comfy client and model_storage to isolate credit logic
        with patch("app.main.get_comfy_client") as mock_comfy_getter, patch(
            "app.main.model_storage.resolve_installed_gallery_file"
        ) as mock_resolve:
            mock_comfy = AsyncMock()
            mock_comfy_getter.return_value = mock_comfy
            mock_resolve.return_value = {
                "model_id": "a" * 32,
                "version_id": "b" * 32,
                "file_id": "c" * 32,
                "title": "SDXL Base",
                "model_type": "Checkpoint",
                "version_name": "1.0",
                "category": "checkpoints",
                "filename": "sd_xl_base.safetensors",
            }
            mock_comfy.resolve_model_name = AsyncMock(return_value="sd_xl_base.safetensors")
            mock_comfy.queue_prompt = AsyncMock(return_value="prompt-123")
            mock_comfy.wait_until_done = AsyncMock(return_value="completed")
            mock_comfy.list_images = AsyncMock(return_value=[])

            gen_payload = {
                "model_id": "a" * 32,
                "version_id": "b" * 32,
                "file_id": "c" * 32,
                "prompt": "a cinematic masterpiece",
            }

            # 1. Authenticated generation: should deduct 2 credits (from 100 to 98)
            res_auth = self.client.post(
                "/api/v1/generate",
                json=gen_payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(res_auth.status_code, 200)
            credits_after = self.credits.get_user_credits(user_id)
            self.assertEqual(credits_after.balance, 98)

            # 2. Deplete user's balance to 1 credit
            self.db.update_credits(user_id, balance=1)

            # Try generating when cost is 2 -> 402 Payment Required
            res_insufficient = self.client.post(
                "/api/v1/generate",
                json=gen_payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(res_insufficient.status_code, 402)
            self.assertIn("INSUFFICIENT_CREDITS", res_insufficient.json()["detail"])

            # 3. Unauthenticated guest generation (backwards compatibility): succeeds without deduction
            res_guest = self.client.post(
                "/api/v1/generate",
                json=gen_payload,
            )
            self.assertEqual(res_guest.status_code, 200)

    def test_email_verification_flow(self) -> None:
        reg = self.client.post(
            "/api/auth/register",
            json={"email": "unverified@test.com", "username": "unverified_user", "password": "password123"},
        ).json()
        token = reg["access_token"]
        user_id = reg["user"]["id"]

        # User is unverified initially
        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        self.assertFalse(me["is_verified"])

        # Fetch verification token from test db
        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT token FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'",
                (user_id,),
            ).fetchone()
            v_token = row["token"]

        # GET /api/auth/verify-email?token=...
        res_v = self.client.get(f"/api/auth/verify-email?token={v_token}")
        self.assertEqual(res_v.status_code, 200)
        self.assertTrue(res_v.json()["success"])

        # User is now verified
        me_after = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        self.assertTrue(me_after["is_verified"])

        # Re-using the same token should fail
        res_reuse = self.client.get(f"/api/auth/verify-email?token={v_token}")
        self.assertEqual(res_reuse.status_code, 400)

    def test_email_verification_via_otp(self) -> None:
        reg = self.client.post(
            "/api/auth/register",
            json={"email": "otpverify@test.com", "username": "otpverify_user", "password": "password123"},
        ).json()
        user_id = reg["user"]["id"]

        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT otp_code FROM auth_tokens WHERE user_id = ? AND token_type = 'email_verification'",
                (user_id,),
            ).fetchone()
            otp = row["otp_code"]

        # POST /api/auth/verify-email with email and OTP
        res_v = self.client.post("/api/auth/verify-email", json={"email": "otpverify@test.com", "otp_code": otp})
        self.assertEqual(res_v.status_code, 200)

        # Check in DB
        u = self.db.get_user_by_id(user_id)
        self.assertTrue(u["is_verified"])

    def test_password_reset_flow(self) -> None:
        self.client.post(
            "/api/auth/register",
            json={"email": "reset@test.com", "username": "reset_user", "password": "oldPassword123"},
        )
        user = self.db.get_user_by_email("reset@test.com")

        # Request reset
        forgot_res = self.client.post("/api/auth/forgot-password", json={"email": "reset@test.com"})
        self.assertEqual(forgot_res.status_code, 200)

        # Find reset token
        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT token FROM auth_tokens WHERE user_id = ? AND token_type = 'password_reset'",
                (user["id"],),
            ).fetchone()
            reset_token = row["token"]

        # Reset password
        res_reset = self.client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "newStrongPassword456!"},
        )
        self.assertEqual(res_reset.status_code, 200)

        # Old password fails
        login_old = self.client.post("/api/auth/login", json={"email": "reset@test.com", "password": "oldPassword123"})
        self.assertEqual(login_old.status_code, 401)

        # New password succeeds
        login_new = self.client.post("/api/auth/login", json={"email": "reset@test.com", "password": "newStrongPassword456!"})
        self.assertEqual(login_new.status_code, 200)

    def test_password_reset_via_otp(self) -> None:
        self.client.post(
            "/api/auth/register",
            json={"email": "otpreset@test.com", "username": "otpreset_user", "password": "oldPassword123"},
        )
        user = self.db.get_user_by_email("otpreset@test.com")

        # Request reset
        self.client.post("/api/auth/forgot-password", json={"email": "otpreset@test.com"})

        with self.db.get_connection() as conn:
            row = conn.execute(
                "SELECT otp_code FROM auth_tokens WHERE user_id = ? AND token_type = 'password_reset'",
                (user["id"],),
            ).fetchone()
            otp = row["otp_code"]

        # Reset password with email + otp_code
        res_reset = self.client.post(
            "/api/auth/reset-password",
            json={"email": "otpreset@test.com", "otp_code": otp, "new_password": "brandNewPassword789"},
        )
        self.assertEqual(res_reset.status_code, 200)

        login_new = self.client.post("/api/auth/login", json={"email": "otpreset@test.com", "password": "brandNewPassword789"})
        self.assertEqual(login_new.status_code, 200)

    def test_resend_verification(self) -> None:
        self.client.post(
            "/api/auth/register",
            json={"email": "resend@test.com", "username": "resend_user", "password": "password123"},
        )
        res = self.client.post("/api/auth/resend-verification", json={"email": "resend@test.com"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])

    def test_provider_factory_cloud_expandability(self) -> None:
        # Default is LocalAuthProvider
        default_p = get_auth_provider()
        self.assertIsInstance(default_p, LocalAuthProvider)

        # Switching to Supabase provider
        supabase_provider = SupabaseAuthProvider()
        with self.assertRaises(NotImplementedError):
            supabase_provider.create_user("test@cloud.com", "clouduser", "pw")


if __name__ == "__main__":
    unittest.main()
