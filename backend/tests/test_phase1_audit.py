"""
Phase 1 audit tests:
  - Wardrobe upload validation (empty / too-large / data-uri-prefix-stripped)
  - Auth signup age gate (13+ with guardian when <18, back-compat when no birth_year)
  - GET / PATCH /api/profile regression
"""
import time
import requests
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _unique_email(tag: str) -> str:
    return f"qa+{tag}_{int(time.time() * 1000)}@closetai.com"


def _signup(api, base_url, payload):
    return api.post(f"{base_url}/api/auth/signup", json=payload)


def _login_test_user(api, base_url):
    r = api.post(
        f"{base_url}/api/auth/login",
        json={"email": "test@closetai.com", "password": "test1234"},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ---------------------------------------------------------------------------
# A.1 Wardrobe upload validation
# ---------------------------------------------------------------------------
class TestWardrobeUpload:
    def setup_method(self):
        self.created_ids = []

    def teardown_method(self):
        # best-effort cleanup
        pass

    def _auth_session(self, api, base_url):
        # Create a fresh adult user via signup (also exercises happy-path signup)
        email = _unique_email("upload")
        r = _signup(
            api,
            base_url,
            {
                "name": "QA Upload",
                "email": email,
                "password": "qa12345",
                "birth_year": 1990,
            },
        )
        assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
        token = r.json()["token"]
        s = requests.Session()
        s.headers.update(
            {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        )
        return s

    def test_empty_image_returns_400(self, api, base_url):
        s = self._auth_session(api, base_url)
        r = s.post(
            f"{base_url}/api/wardrobe",
            json={"image_base64": "", "category": "top"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "Photo is empty" in r.text

    def test_too_large_image_returns_413(self, api, base_url):
        s = self._auth_session(api, base_url)
        big_b64 = "A" * (7 * 1024 * 1024)  # ~7 MB base64 => ~5.25 MB binary > 6 MB cap? actually 5.25MB<6MB
        # The cap is 6 MB binary == 8 MB base64. We need to exceed 6 MB binary.
        # binary_bytes = (len_b64 * 3) // 4. To exceed 6MB binary => need ~8.4MB b64.
        big_b64 = "A" * (9 * 1024 * 1024)
        r = s.post(
            f"{base_url}/api/wardrobe",
            json={"image_base64": big_b64, "category": "top"},
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text}"
        assert "too large" in r.text.lower()

    def test_data_uri_prefix_is_stripped_and_item_created(self, api, base_url):
        s = self._auth_session(api, base_url)
        b64 = "data:image/jpeg;base64," + ("/" * 1000)
        r = s.post(
            f"{base_url}/api/wardrobe",
            json={"image_base64": b64, "category": "top", "name": "TEST_phase1_uri"},
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        body = r.json()
        assert body.get("id"), "item id missing"
        assert body.get("category") == "top"
        # Backend should have stripped the data:image/... prefix from stored b64
        stored = body.get("image_base64", "")
        assert not stored.startswith("data:"), "data-uri prefix was NOT stripped"
        # Cleanup
        s.delete(f"{base_url}/api/wardrobe/{body['id']}")

    def test_successful_upload_returns_wardrobe_item(self, api, base_url):
        s = self._auth_session(api, base_url)
        b64 = "/" * 2000  # ~1.5 KB binary
        r = s.post(
            f"{base_url}/api/wardrobe",
            json={
                "image_base64": b64,
                "category": "bottom",
                "name": "TEST_phase1_ok",
                "color": "blue",
                "rating": 4,
            },
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        body = r.json()
        for key in ("id", "user_id", "category", "name", "color", "rating", "created_at"):
            assert key in body, f"missing key {key} in response"
        assert body["category"] == "bottom"
        assert body["name"] == "TEST_phase1_ok"
        # GET to verify persistence
        gr = s.get(f"{base_url}/api/wardrobe/{body['id']}")
        assert gr.status_code == 200
        assert gr.json()["id"] == body["id"]
        s.delete(f"{base_url}/api/wardrobe/{body['id']}")


# ---------------------------------------------------------------------------
# A.2 Signup age gate
# ---------------------------------------------------------------------------
class TestSignupAgeGate:
    def test_adult_birthyear_succeeds(self, api, base_url):
        r = _signup(
            api,
            base_url,
            {
                "name": "Adult",
                "email": _unique_email("adult"),
                "password": "qa12345",
                "birth_year": 1990,
            },
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "token" in body and "user" in body

    def test_age_14_without_guardian_returns_400(self, api, base_url):
        r = _signup(
            api,
            base_url,
            {
                "name": "Teen",
                "email": _unique_email("teen14"),
                "password": "qa12345",
                "birth_year": 2012,
            },
        )
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        # Match either copy variation
        msg = r.text.lower()
        assert ("parent" in msg or "guardian" in msg) and "18" in msg

    def test_age_14_with_guardian_succeeds(self, api, base_url):
        r = _signup(
            api,
            base_url,
            {
                "name": "Teen OK",
                "email": _unique_email("teen14g"),
                "password": "qa12345",
                "birth_year": 2012,
                "guardian_email": "parent@example.com",
            },
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "token" in body and "user" in body

    def test_age_11_returns_400(self, api, base_url):
        r = _signup(
            api,
            base_url,
            {
                "name": "TooYoung",
                "email": _unique_email("kid11"),
                "password": "qa12345",
                "birth_year": 2015,
            },
        )
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        msg = r.text.lower()
        assert "13" in msg

    def test_no_birth_year_succeeds_backcompat(self, api, base_url):
        r = _signup(
            api,
            base_url,
            {
                "name": "NoBy",
                "email": _unique_email("noby"),
                "password": "qa12345",
            },
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"


# ---------------------------------------------------------------------------
# A.3 Profile GET/PATCH regression
# ---------------------------------------------------------------------------
class TestProfileRegression:
    def test_get_and_patch_profile(self, api, base_url):
        token = _login_test_user(api, base_url)
        s = requests.Session()
        s.headers.update(
            {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        )
        # GET
        r = s.get(f"{base_url}/api/profile")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        before = r.json()
        # PATCH a couple of harmless fields
        new_height = (before.get("height_cm") or 170) + 0  # no-op but valid write
        patch_body = {
            "height_cm": new_height,
            "weight_kg": before.get("weight_kg") or 65,
        }
        r2 = s.patch(f"{base_url}/api/profile", json=patch_body)
        assert r2.status_code == 200, f"{r2.status_code} {r2.text}"
        after = r2.json()
        assert after.get("height_cm") == patch_body["height_cm"]
        assert after.get("weight_kg") == patch_body["weight_kg"]
        # GET to confirm persistence
        r3 = s.get(f"{base_url}/api/profile")
        assert r3.status_code == 200
        assert r3.json().get("height_cm") == patch_body["height_cm"]
