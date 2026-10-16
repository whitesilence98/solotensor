import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import get_db

def inspect():
    db = get_db()
    with db.get_connection() as conn:
        print("=== ROLES ===")
        roles = conn.execute("SELECT name, tier_level, display_name FROM roles ORDER BY tier_level ASC;").fetchall()
        for r in roles:
            perm_count = conn.execute("SELECT COUNT(*) as c FROM role_permissions WHERE role_name = ?;", (r["name"],)).fetchone()["c"]
            print(f"- {r['name']} (Tier {r['tier_level']}): {r['display_name']} [{perm_count} perms]")

        print("\n=== USERS ===")
        users = conn.execute("SELECT id, username, email, display_name, role FROM users;").fetchall()
        print(f"Total users: {len(users)}")
        for u in users:
            roles = db.get_user_roles(u["id"])
            perms = db.get_user_permissions(u["id"])
            print(f"- {u['username']} ({u['email']}) | DB role: {u['role']} | Roles: {roles} | Perms count: {len(perms)}")

if __name__ == "__main__":
    inspect()
