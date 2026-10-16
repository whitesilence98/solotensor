import sys
import io

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import requests
import json

BASE_URL = "http://127.0.0.1:8000"

USERS_TO_TEST = [
    ("cyber_artisan", "creator"),
    ("pixel_poet", "creator"),
    ("neon_architect", "pro_creator"),
    ("lora_mastermind", "verified_creator"),
    ("sentinel_mod", "moderator"),
    ("solotensor_admin", "admin"),
    ("winnguyen282", "admin"),
]

def verify_all():
    print("=" * 80)
    print("VERIFYING LIVE ENDPOINTS FOR SEEDED USERS")
    print("=" * 80)
    
    for username, expected_role in USERS_TO_TEST:
        # 1. Public profile check
        res = requests.get(f"{BASE_URL}/api/users/{username}")
        if res.status_code != 200:
            print(f"❌ Failed to fetch profile for {username}: {res.status_code} {res.text}")
            continue
        data = res.json()
        roles = data.get("roles", [])
        primary = data.get("primary_role") or data.get("role")
        perms_count = len(data.get("permissions", []))
        
        # 2. Login check (for seeded demo users with Password123!)
        login_status = "N/A"
        if username != "winnguyen282":
            login_res = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email_or_username": username, "password": "Password123!"}
            )
            login_status = "✅ Token OK" if login_res.status_code == 200 else f"❌ {login_res.status_code}"

        print(f"[{primary.upper():<16}] {username:<18} | Primary: {primary:<16} | Roles: {str(roles):<30} | Perms: {perms_count:<2} | Login: {login_status}")

if __name__ == "__main__":
    verify_all()
