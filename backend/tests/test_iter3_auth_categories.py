"""Iteration 3 tests: password reset OTP flow + custom categories + AI stylist contract."""
import os
import re
import time
import uuid
import subprocess
import pytest

BACKEND_LOG = "/var/log/supervisor/backend.err.log"
TEST_USER_EMAIL = "test@closetai.com"
TEST_USER_PASSWORD = "test1234"  # baseline; tests may rotate; restored at end


def _read_otp_from_logs(email: str, since_ts: float, timeout: float = 8.0) -> str:
    """Tail backend.err.log for 'OTP for <email> (dev fallback): <code>' since the given time.
    Returns the latest 6-digit code found."""
    pattern = re.compile(rf"OTP for {re.escape(email)} \(dev fallback\): (\d{{6}})")
    deadline = time.time() + timeout
    last_code = None
    while time.time() < deadline:
        try:
            out = subprocess.check_output(["tail", "-n", "400", BACKEND_LOG], text=True, stderr=subprocess.DEVNULL)
        except Exception:
            out = ""
        # find all matches with their position; we accept any match (file is rotated/appended; tail is enough)
        for m in pattern.finditer(out):
            last_code = m.group(1)
        if last_code:
            return last_code
        time.sleep(0.4)
    return last_code or ""


# ---------------------------------------------------------------------------
# Ensure baseline test user exists & password is test1234. Yields the auth headers.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def ensure_baseline_user(api, base_url):
    # Try login; if fails, sign up; if email taken but pw wrong, reset via OTP flow.
    r = api.post(f"{base_url}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    if r.status_code == 200:
        return r.json()
    r = api.post(f"{base_url}/api/auth/signup", json={
        "email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD, "name": "Test User"
    })
    if r.status_code == 200:
        return r.json()
    # Email exists but pw wrong -> reset via OTP
    _do_reset_to(api, base_url, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    r = api.post(f"{base_url}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    assert r.status_code == 200, f"Could not establish baseline user: {r.status_code} {r.text}"
    return r.json()


def _do_reset_to(api, base_url, email: str, new_password: str):
    since = time.time()
    r = api.post(f"{base_url}/api/auth/forgot", json={"email": email})
    assert r.status_code == 200
    otp = _read_otp_from_logs(email, since)
    assert otp, f"Could not read OTP for {email} from logs"
    r = api.post(f"{base_url}/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    tok = r.json()["reset_token"]
    r = api.post(f"{base_url}/api/auth/reset", json={"reset_token": tok, "new_password": new_password})
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def auth_headers(ensure_baseline_user):
    return {"Authorization": f"Bearer {ensure_baseline_user['token']}", "Content-Type": "application/json"}


# ===========================================================================
# 1. /api/auth/forgot — always ok:true; cooldown on repeat
# ===========================================================================
class TestForgot:
    def test_unknown_email_returns_ok_no_enumeration(self, api, base_url):
        unknown = f"nobody_{uuid.uuid4().hex[:8]}@closetai.com"
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": unknown})
        assert r.status_code == 200
        body = r.json()
        assert body == {"ok": True}, f"Expected exact {{ok:true}} for unknown email, got {body}"

    def test_known_email_returns_ok_and_logs_otp(self, api, base_url, ensure_baseline_user):
        # Cooldown safety: sleep so previous tests don't trigger cooldown branch
        time.sleep(46)
        since = time.time()
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "cooldown_seconds" not in body, f"Unexpected cooldown on fresh request: {body}"
        otp = _read_otp_from_logs(TEST_USER_EMAIL, since)
        assert otp and len(otp) == 6 and otp.isdigit()

    def test_cooldown_on_immediate_resend(self, api, base_url):
        # Previous test created a fresh OTP; an immediate second call must include cooldown_seconds
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "cooldown_seconds" in body, f"Expected cooldown_seconds, got {body}"
        assert isinstance(body["cooldown_seconds"], int) and body["cooldown_seconds"] > 0


# ===========================================================================
# 2. verify-otp: bad code, lockout, valid code
# ===========================================================================
class TestVerifyOtp:
    def test_wrong_otp_returns_400_then_lockout_after_5(self, api, base_url):
        # Ensure a fresh pending OTP exists (sleep past cooldown)
        time.sleep(46)
        since = time.time()
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200 and "cooldown_seconds" not in r.json()
        good_otp = _read_otp_from_logs(TEST_USER_EMAIL, since)
        assert good_otp
        # 5 wrong attempts -> each 400 "Invalid code"
        bad = "000000" if good_otp != "000000" else "111111"
        for i in range(5):
            r = api.post(f"{base_url}/api/auth/verify-otp", json={"email": TEST_USER_EMAIL, "otp": bad})
            assert r.status_code == 400, f"attempt {i+1}: {r.status_code} {r.text}"
            assert "Invalid code" in r.json().get("detail", "")
        # 6th attempt should be locked -> 429
        r = api.post(f"{base_url}/api/auth/verify-otp", json={"email": TEST_USER_EMAIL, "otp": bad})
        assert r.status_code == 429, f"Expected 429 lockout, got {r.status_code} {r.text}"

    def test_valid_otp_returns_reset_token(self, api, base_url):
        # Need fresh OTP (previous was locked). Sleep past cooldown.
        time.sleep(46)
        since = time.time()
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200 and "cooldown_seconds" not in r.json()
        otp = _read_otp_from_logs(TEST_USER_EMAIL, since)
        assert otp
        r = api.post(f"{base_url}/api/auth/verify-otp", json={"email": TEST_USER_EMAIL, "otp": otp})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reset_token" in body and isinstance(body["reset_token"], str) and body["reset_token"].count(".") == 2


# ===========================================================================
# 3. /api/auth/reset — happy path, reuse, invalid token, login behavior
# ===========================================================================
class TestReset:
    def test_full_reset_flow_and_token_single_use(self, api, base_url):
        # Sleep past cooldown
        time.sleep(46)
        since = time.time()
        r = api.post(f"{base_url}/api/auth/forgot", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200 and "cooldown_seconds" not in r.json()
        otp = _read_otp_from_logs(TEST_USER_EMAIL, since)
        assert otp
        r = api.post(f"{base_url}/api/auth/verify-otp", json={"email": TEST_USER_EMAIL, "otp": otp})
        assert r.status_code == 200
        reset_token = r.json()["reset_token"]

        new_pw = "NewPass_" + uuid.uuid4().hex[:6]
        r = api.post(f"{base_url}/api/auth/reset", json={"reset_token": reset_token, "new_password": new_pw})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Login with new password works
        r = api.post(f"{base_url}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": new_pw})
        assert r.status_code == 200, r.text

        # Old password no longer works
        r = api.post(f"{base_url}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
        assert r.status_code == 401

        # Reusing reset_token must fail
        r = api.post(f"{base_url}/api/auth/reset", json={"reset_token": reset_token, "new_password": "Another_" + uuid.uuid4().hex[:6]})
        assert r.status_code == 400, f"Token reuse should fail, got {r.status_code} {r.text}"

        # Restore baseline password
        _do_reset_to(api, base_url, TEST_USER_EMAIL, TEST_USER_PASSWORD)
        r = api.post(f"{base_url}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
        assert r.status_code == 200

    def test_invalid_reset_token_returns_400(self, api, base_url):
        for bad in ["not.a.jwt", "abc", "", "x.y.z"]:
            r = api.post(f"{base_url}/api/auth/reset", json={"reset_token": bad, "new_password": "whatever123"})
            assert r.status_code == 400, f"bad={bad!r} -> {r.status_code} {r.text}"


# ===========================================================================
# 4. Categories
# ===========================================================================
class TestCategories:
    def test_list_built_in_at_least_19(self, api, base_url, auth_headers):
        r = api.get(f"{base_url}/api/categories", headers=auth_headers)
        assert r.status_code == 200, r.text
        cats = r.json()
        built_in = [c for c in cats if c.get("built_in") is True]
        assert len(built_in) >= 19, f"Expected >=19 built-in, got {len(built_in)}"
        # All required structural fields present
        for c in cats:
            assert set(c.keys()) >= {"id", "name", "built_in"}

    def test_requires_auth(self, api, base_url):
        r = api.get(f"{base_url}/api/categories")
        assert r.status_code in (401, 403)

    def test_create_custom_and_idempotent(self, api, base_url, auth_headers):
        unique = "Vintage Tees " + uuid.uuid4().hex[:4]
        r = api.post(f"{base_url}/api/categories", headers=auth_headers, json={"name": unique})
        assert r.status_code == 200, r.text
        first = r.json()
        assert first["built_in"] is False
        assert first["id"] == re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", unique.lower())).strip("_")[:40]

        # Idempotent: same name returns existing (same id)
        r2 = api.post(f"{base_url}/api/categories", headers=auth_headers, json={"name": unique})
        assert r2.status_code == 200
        assert r2.json()["id"] == first["id"]

        # Listed under user's categories
        r3 = api.get(f"{base_url}/api/categories", headers=auth_headers)
        ids = [c["id"] for c in r3.json()]
        assert first["id"] in ids

        # Cleanup
        api.delete(f"{base_url}/api/categories/{first['id']}", headers=auth_headers)

    def test_create_with_builtin_slug_returns_409(self, api, base_url, auth_headers):
        r = api.post(f"{base_url}/api/categories", headers=auth_headers, json={"name": "Tops"})
        assert r.status_code == 409, r.text

    def test_cannot_delete_built_in(self, api, base_url, auth_headers):
        r = api.delete(f"{base_url}/api/categories/tops", headers=auth_headers)
        assert r.status_code == 400, r.text

    def test_delete_user_category_succeeds_and_cross_user_404(self, api, base_url, auth_headers):
        # Create a user category to delete
        name = "TEST Cat " + uuid.uuid4().hex[:6]
        r = api.post(f"{base_url}/api/categories", headers=auth_headers, json={"name": name})
        assert r.status_code == 200
        cid = r.json()["id"]

        # Create a second user; their delete on this cid must 404
        other_email = f"TEST_cat_other_{uuid.uuid4().hex[:8]}@closetai.com"
        sign = api.post(f"{base_url}/api/auth/signup", json={"email": other_email, "password": "pw123456", "name": "Cat Other"})
        assert sign.status_code == 200
        other_headers = {"Authorization": f"Bearer {sign.json()['token']}", "Content-Type": "application/json"}
        r2 = api.delete(f"{base_url}/api/categories/{cid}", headers=other_headers)
        assert r2.status_code == 404, r2.text

        # Owner deletes -> 200
        r3 = api.delete(f"{base_url}/api/categories/{cid}", headers=auth_headers)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True

        # Second delete -> 404
        r4 = api.delete(f"{base_url}/api/categories/{cid}", headers=auth_headers)
        assert r4.status_code == 404


# ===========================================================================
# 5. Wardrobe accepts custom category id
# ===========================================================================
class TestWardrobeCustomCategory:
    def test_create_with_custom_category(self, api, base_url, auth_headers, real_image_b64):
        # Create a custom category first
        name = "Vintage Tees " + uuid.uuid4().hex[:4]
        r = api.post(f"{base_url}/api/categories", headers=auth_headers, json={"name": name})
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            payload = {
                "image_base64": real_image_b64,
                "category": cid,
                "name": "TEST custom-cat item",
                "color": "white",
                "rating": 4,
                "privacy": "friends",
                "tags": ["test"],
            }
            r = api.post(f"{base_url}/api/wardrobe", headers=auth_headers, json=payload)
            assert r.status_code == 200, r.text
            item = r.json()
            assert item["category"] == cid

            # Filter by category returns it
            r2 = api.get(f"{base_url}/api/wardrobe?category={cid}", headers=auth_headers)
            assert r2.status_code == 200
            assert any(it["id"] == item["id"] for it in r2.json())

            # Cleanup item
            api.delete(f"{base_url}/api/wardrobe/{item['id']}", headers=auth_headers)
        finally:
            api.delete(f"{base_url}/api/categories/{cid}", headers=auth_headers)

    def test_empty_category_rejected(self, api, base_url, auth_headers, real_image_b64):
        r = api.post(f"{base_url}/api/wardrobe", headers=auth_headers, json={
            "image_base64": real_image_b64, "category": "", "rating": 3, "privacy": "friends"
        })
        assert r.status_code == 422


# ===========================================================================
# 6. AI stylist endpoint contract
# ===========================================================================
class TestOutfitChat:
    def test_outfit_chat_contract(self, api, base_url, auth_headers):
        r = api.post(
            f"{base_url}/api/outfit/chat",
            headers=auth_headers,
            json={"message": "What should I wear to a casual brunch?", "occasion": "brunch"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) >= {"reply", "session_id", "recommended_item_ids"}
        assert isinstance(body["reply"], str) and len(body["reply"]) > 0
        assert isinstance(body["session_id"], str) and body["session_id"]
        assert isinstance(body["recommended_item_ids"], list)
