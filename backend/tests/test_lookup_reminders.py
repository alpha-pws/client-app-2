"""
Backend tests for iteration 2: contacts lookup (/api/users/lookup) and
reminders CRUD (/api/reminders).

Run:
    pytest /app/backend/tests/test_lookup_reminders.py -v \
        --junitxml=/app/test_reports/pytest/pytest_lookup_reminders.xml
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------
def _signup(api: requests.Session, base_url: str, prefix: str) -> dict:
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_{prefix}_{suffix}@closetai.com".lower()
    payload = {"email": email, "password": "test1234", "name": f"TEST {prefix} {suffix}"}
    r = api.post(f"{base_url}/api/auth/signup", json=payload)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "email": email,
        "token": data["token"],
        "id": data["user"]["id"],
        "name": data["user"]["name"],
    }


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_a(api, base_url):
    return _signup(api, base_url, "lookup_a")


@pytest.fixture(scope="module")
def user_b(api, base_url):
    return _signup(api, base_url, "lookup_b")


@pytest.fixture(scope="module")
def user_c(api, base_url):
    """A third unrelated user, used to check exclusion / strangers."""
    return _signup(api, base_url, "lookup_c")


# ---------------------------------------------------------------------------
# /api/users/lookup
# ---------------------------------------------------------------------------
class TestContactsLookup:
    def test_empty_emails_returns_empty_list(self, api, base_url, user_a):
        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": []},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json() == []

    def test_lookup_requires_auth(self, api, base_url):
        r = api.post(f"{base_url}/api/users/lookup", json={"emails": ["x@y.com"]})
        assert r.status_code == 401

    def test_lookup_excludes_self_and_returns_friend_status_none(
        self, api, base_url, user_a, user_b, user_c
    ):
        # Include user_a's own email + user_b + user_c + a non-existent email.
        emails = [user_a["email"], user_b["email"], user_c["email"], "TEST_no_such_user_xyz@closetai.test"]
        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": emails},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        results = r.json()
        ids = {u["id"] for u in results}
        assert user_a["id"] not in ids, "calling user must be excluded"
        assert user_b["id"] in ids
        assert user_c["id"] in ids
        # Ensure expected fields present + friend_status is None for non-friends
        by_id = {u["id"]: u for u in results}
        for uid in (user_b["id"], user_c["id"]):
            entry = by_id[uid]
            for key in ("id", "name", "email", "avatar", "friend_status"):
                assert key in entry, f"missing key {key} in lookup result"
            assert entry["friend_status"] is None

    def test_lookup_reflects_pending_then_accepted(
        self, api, base_url, user_a, user_b
    ):
        # 1) A sends friend request to B -> A's lookup for B should be 'pending'
        r = api.post(
            f"{base_url}/api/friends/request",
            json={"email": user_b["email"]},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        friendship = r.json()
        friendship_id = friendship["id"]
        assert friendship["status"] == "pending"

        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": [user_b["email"]]},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        res = r.json()
        assert len(res) == 1
        assert res[0]["id"] == user_b["id"]
        assert res[0]["friend_status"] == "pending"

        # Lookup from B's side should also mark A as 'pending'
        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": [user_a["email"]]},
            headers=_auth_headers(user_b["token"]),
        )
        assert r.status_code == 200, r.text
        res_b = r.json()
        assert len(res_b) == 1
        assert res_b[0]["friend_status"] == "pending"

        # 2) B accepts -> both sides see 'accepted'
        r = api.post(
            f"{base_url}/api/friends/{friendship_id}/accept",
            headers=_auth_headers(user_b["token"]),
        )
        assert r.status_code == 200, r.text

        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": [user_b["email"]]},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()[0]["friend_status"] == "accepted"

    def test_lookup_is_case_insensitive(self, api, base_url, user_a, user_c):
        r = api.post(
            f"{base_url}/api/users/lookup",
            json={"emails": [user_c["email"].upper()]},
            headers=_auth_headers(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        results = r.json()
        assert len(results) == 1
        assert results[0]["id"] == user_c["id"]


# ---------------------------------------------------------------------------
# /api/reminders CRUD
# ---------------------------------------------------------------------------
def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def reminder_user(api, base_url):
    return _signup(api, base_url, "rem_owner")


@pytest.fixture(scope="module")
def reminder_other(api, base_url):
    return _signup(api, base_url, "rem_other")


class TestReminders:
    def test_create_reminder_returns_done_false(self, api, base_url, reminder_user):
        body = {
            "title": "TEST Do laundry",
            "type": "laundry",
            "remind_at": _iso(datetime.now(timezone.utc) + timedelta(hours=4)),
            "notes": "whites only",
            "notification_id": "local-abc-1",
        }
        r = api.post(
            f"{base_url}/api/reminders",
            json=body,
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"]
        assert data["user_id"] == reminder_user["id"]
        assert data["title"] == body["title"]
        assert data["type"] == "laundry"
        assert data["remind_at"] == body["remind_at"]
        assert data["notes"] == "whites only"
        assert data["notification_id"] == "local-abc-1"
        assert data["done"] is False
        assert "created_at" in data
        # Stash for later tests
        TestReminders._rid_done = data["id"]

    def test_create_rejects_invalid_type(self, api, base_url, reminder_user):
        body = {
            "title": "TEST bad type",
            "type": "not-a-type",
            "remind_at": _iso(datetime.now(timezone.utc) + timedelta(hours=1)),
        }
        r = api.post(
            f"{base_url}/api/reminders",
            json=body,
            headers=_auth_headers(reminder_user["token"]),
        )
        # FastAPI/Pydantic validation -> 422
        assert r.status_code == 422, r.text

    def test_list_reminders_sorted_asc(self, api, base_url, reminder_user):
        # Create two more with out-of-order remind_at to test sorting
        now = datetime.now(timezone.utc)
        far = {
            "title": "TEST Far reminder",
            "type": "outfit_prep",
            "remind_at": _iso(now + timedelta(days=3)),
        }
        near = {
            "title": "TEST Near reminder",
            "type": "shopping",
            "remind_at": _iso(now + timedelta(hours=1)),
        }
        r1 = api.post(
            f"{base_url}/api/reminders",
            json=far,
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r1.status_code == 200
        r2 = api.post(
            f"{base_url}/api/reminders",
            json=near,
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r2.status_code == 200
        TestReminders._rid_near = r2.json()["id"]
        TestReminders._rid_far = r1.json()["id"]

        r = api.get(
            f"{base_url}/api/reminders",
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200, r.text
        items = r.json()
        # All belong to current user
        assert all(it["user_id"] == reminder_user["id"] for it in items)
        # Sorted ascending by remind_at
        remind_times = [it["remind_at"] for it in items]
        assert remind_times == sorted(remind_times), f"not asc-sorted: {remind_times}"
        # Our created reminders are present
        ids = {it["id"] for it in items}
        assert TestReminders._rid_done in ids
        assert TestReminders._rid_near in ids
        assert TestReminders._rid_far in ids

    def test_patch_mark_done(self, api, base_url, reminder_user):
        rid = TestReminders._rid_done
        r = api.patch(
            f"{base_url}/api/reminders/{rid}",
            json={"done": True},
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["done"] is True
        # Verify persistence via GET list
        lst = api.get(
            f"{base_url}/api/reminders",
            headers=_auth_headers(reminder_user["token"]),
        ).json()
        found = [x for x in lst if x["id"] == rid][0]
        assert found["done"] is True

    def test_patch_update_notification_id(self, api, base_url, reminder_user):
        rid = TestReminders._rid_near
        r = api.patch(
            f"{base_url}/api/reminders/{rid}",
            json={"notification_id": "xyz"},
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["notification_id"] == "xyz"
        # done should remain False (untouched)
        assert r.json()["done"] is False

    def test_other_user_cannot_read_modify_delete(
        self, api, base_url, reminder_user, reminder_other
    ):
        rid = TestReminders._rid_far
        # PATCH attempt by other user -> 404 (scoped query miss)
        r = api.patch(
            f"{base_url}/api/reminders/{rid}",
            json={"done": True},
            headers=_auth_headers(reminder_other["token"]),
        )
        assert r.status_code == 404, r.text

        # DELETE attempt by other user -> 404
        r = api.delete(
            f"{base_url}/api/reminders/{rid}",
            headers=_auth_headers(reminder_other["token"]),
        )
        assert r.status_code == 404, r.text

        # Other user's list should NOT include this reminder
        r = api.get(
            f"{base_url}/api/reminders",
            headers=_auth_headers(reminder_other["token"]),
        )
        assert r.status_code == 200
        ids = {it["id"] for it in r.json()}
        assert rid not in ids
        assert TestReminders._rid_done not in ids
        assert TestReminders._rid_near not in ids

        # And owner can still see/modify it
        r = api.patch(
            f"{base_url}/api/reminders/{rid}",
            json={"done": True},
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200
        assert r.json()["done"] is True

    def test_delete_reminder_and_verify_gone(self, api, base_url, reminder_user):
        rid = TestReminders._rid_near
        r = api.delete(
            f"{base_url}/api/reminders/{rid}",
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Second delete -> 404
        r2 = api.delete(
            f"{base_url}/api/reminders/{rid}",
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r2.status_code == 404
        # And list no longer contains it
        lst = api.get(
            f"{base_url}/api/reminders",
            headers=_auth_headers(reminder_user["token"]),
        ).json()
        assert rid not in {x["id"] for x in lst}

    def test_patch_nonexistent_returns_404(self, api, base_url, reminder_user):
        r = api.patch(
            f"{base_url}/api/reminders/{uuid.uuid4()}",
            json={"done": True},
            headers=_auth_headers(reminder_user["token"]),
        )
        assert r.status_code == 404

    def test_reminders_requires_auth(self, api, base_url):
        assert api.get(f"{base_url}/api/reminders").status_code == 401
        assert (
            api.post(
                f"{base_url}/api/reminders",
                json={
                    "title": "x",
                    "type": "other",
                    "remind_at": _iso(datetime.now(timezone.utc)),
                },
            ).status_code
            == 401
        )
