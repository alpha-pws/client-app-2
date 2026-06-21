"""Phase 2 audit batch backend tests.

Covers:
- Username system + user search + username PATCH
- Phone-hash registration + contact match (email/phone)
- Friend Discovery v2 (request via username, block, unblock, permissions)
- Image messages (image_base64 + empty + too-large + GET history)
"""
import os
import time
import base64
import hashlib
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")

TS = int(time.time())


# ---------- helpers ----------
def _signup(api, suffix, name="Cooper Wells", birth_year=1995, extra=None):
    payload = {
        "email": f"qa+ph2_{suffix}_{TS}@closetai.com",
        "password": "test1234",
        "name": name,
        "birth_year": birth_year,
    }
    if extra:
        payload.update(extra)
    r = api.post(f"{BASE_URL}/api/auth/signup", json=payload)
    return r


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_a():
    s = requests.Session()
    r = _signup(s, "userA", name="Cooper Wells")
    assert r.status_code == 200, f"signup A failed {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "session": s,
            "email": f"qa+ph2_userA_{TS}@closetai.com"}


@pytest.fixture(scope="module")
def user_b():
    s = requests.Session()
    r = _signup(s, "userB", name="Bonnie Banks", birth_year=1992)
    assert r.status_code == 200, f"signup B failed {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "session": s,
            "email": f"qa+ph2_userB_{TS}@closetai.com"}


# ============== 1. Username & user search ==============
class TestUsername:
    def test_signup_returns_username(self, user_a):
        u = user_a["user"]
        assert "username" in u and u["username"], f"missing username: {u}"
        # cooper_wells or cooper_wells_<n>
        assert u["username"].startswith("cooper_wells"), f"unexpected username {u['username']}"

    def test_me_returns_username(self, user_a):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body.get("username") == user_a["user"]["username"]

    def test_user_search_by_prefix(self, user_a, user_b):
        # search from user_b's session so user_a (cooper_wells) is visible
        # (search excludes the calling user).
        r = requests.get(f"{BASE_URL}/api/users/search",
                         params={"q": "coop"},
                         headers=_auth_headers(user_b["token"]))
        assert r.status_code == 200, r.text
        results = r.json()
        assert isinstance(results, list)
        assert len(results) >= 1, "expected at least one match for 'coop'"
        # friendship field must exist on each result
        for u in results:
            assert "friendship" in u, f"missing friendship field on {u}"

    def test_user_search_caps_at_20(self, user_a):
        r = requests.get(f"{BASE_URL}/api/users/search",
                         params={"q": "a"},
                         headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        results = r.json()
        assert isinstance(results, list)
        assert len(results) <= 20

    def test_patch_username_bad_pattern(self, user_a):
        r = requests.patch(f"{BASE_URL}/api/users/username",
                           json={"username": "BAD NAME"},
                           headers=_auth_headers(user_a["token"]))
        assert r.status_code == 422, f"expected 422 for bad pattern, got {r.status_code} {r.text}"

    def test_patch_username_valid(self, user_a):
        # username max length is 18 chars
        new_un = f"cqa_{TS % 100000}"[:18]
        r = requests.patch(f"{BASE_URL}/api/users/username",
                           json={"username": new_un},
                           headers=_auth_headers(user_a["token"]))
        assert r.status_code in (200, 409), r.text
        if r.status_code == 200:
            # propagate the new username for later tests
            me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth_headers(user_a["token"]))
            assert me.json().get("username") == new_un
            user_a["user"]["username"] = new_un


# ============== 2. Contact match ==============
class TestContactMatch:
    PHONE = "1234567890"
    HASH = hashlib.sha256(PHONE.encode()).hexdigest()

    def test_register_phone_hash(self, user_a):
        r = requests.post(f"{BASE_URL}/api/users/phone",
                          json={"phone_hash": self.HASH},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text

    def test_contact_match_via_phone(self, user_a, user_b):
        r = requests.post(f"{BASE_URL}/api/contacts/match",
                          json={"phone_hashes": [self.HASH]},
                          headers=_auth_headers(user_b["token"]))
        assert r.status_code == 200, r.text
        results = r.json()
        assert isinstance(results, list), results
        ids = [u.get("id") for u in results]
        assert user_a["user"]["id"] in ids, f"user A not in phone match: {results}"
        match_a = next(u for u in results if u.get("id") == user_a["user"]["id"])
        assert match_a.get("matched_via") == "phone", match_a

    def test_contact_match_via_email(self, user_a, user_b):
        r = requests.post(f"{BASE_URL}/api/contacts/match",
                          json={"emails": [user_a["email"]]},
                          headers=_auth_headers(user_b["token"]))
        assert r.status_code == 200, r.text
        results = r.json()
        ids = [u.get("id") for u in results]
        assert user_a["user"]["id"] in ids, f"user A not in email match: {results}"
        match_a = next(u for u in results if u.get("id") == user_a["user"]["id"])
        assert match_a.get("matched_via") == "email", match_a


# ============== 3. Friend Discovery v2 ==============
class TestFriendsV2:
    state = {}

    def test_friend_request_via_username(self, user_a, user_b):
        # A → B via B's username
        r = requests.post(f"{BASE_URL}/api/friends/request",
                          json={"username": user_b["user"]["username"]},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "pending", body
        # capture friendship id
        self.state["fid"] = body.get("id") or body.get("friendship_id")
        assert self.state["fid"], f"no friendship id in {body}"

    def test_accept_from_b(self, user_b):
        fid = self.state["fid"]
        r = requests.post(f"{BASE_URL}/api/friends/{fid}/accept",
                          headers=_auth_headers(user_b["token"]))
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "accepted"

    def test_block_by_a(self, user_a, user_b):
        fid = self.state["fid"]
        r = requests.post(f"{BASE_URL}/api/friends/{fid}/block",
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "blocked", body
        assert body.get("direction") == "blocked-by-me", body
        # Now B should see direction blocked-by-them
        rb = requests.get(f"{BASE_URL}/api/friends",
                          headers=_auth_headers(user_b["token"]))
        assert rb.status_code == 200, rb.text
        friends = rb.json()
        target = next((f for f in friends if f.get("id") == fid), None)
        assert target is not None, f"friendship not visible to B: {friends}"
        assert target.get("direction") == "blocked-by-them", target

    def test_unblock_from_b_forbidden(self, user_b):
        fid = self.state["fid"]
        r = requests.post(f"{BASE_URL}/api/friends/{fid}/unblock",
                          headers=_auth_headers(user_b["token"]))
        assert r.status_code == 403, f"expected 403 unblock from non-blocker, got {r.status_code} {r.text}"

    def test_unblock_from_a_removes_row(self, user_a, user_b):
        fid = self.state["fid"]
        r = requests.post(f"{BASE_URL}/api/friends/{fid}/unblock",
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        # confirm GET /friends shows no edge between them
        ra = requests.get(f"{BASE_URL}/api/friends",
                          headers=_auth_headers(user_a["token"]))
        assert ra.status_code == 200
        a_list = ra.json()
        assert not any(f.get("id") == fid for f in a_list), f"friendship still present for A: {a_list}"

    def test_friend_request_via_email_backcompat(self, user_a, user_b):
        # After unblock+removal, request again via email
        r = requests.post(f"{BASE_URL}/api/friends/request",
                          json={"email": user_b["email"]},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "pending", body
        # store new fid for image-message tests
        self.state["fid2"] = body.get("id") or body.get("friendship_id")


# ============== 4. Image messages ==============
class TestImageMessages:
    @pytest.fixture(scope="class")
    def friends_pair(self, user_a, user_b):
        # Accept the pending request created in TestFriendsV2.test_friend_request_via_email_backcompat
        fid = TestFriendsV2.state.get("fid2")
        if not fid:
            # create one
            r = requests.post(f"{BASE_URL}/api/friends/request",
                              json={"email": user_b["email"]},
                              headers=_auth_headers(user_a["token"]))
            assert r.status_code == 200, r.text
            fid = r.json().get("id") or r.json().get("friendship_id")
        # accept from B
        ra = requests.post(f"{BASE_URL}/api/friends/{fid}/accept",
                           headers=_auth_headers(user_b["token"]))
        assert ra.status_code == 200, ra.text
        return {"fid": fid}

    def test_send_image_only_message(self, user_a, user_b, friends_pair):
        # ~1x1 transparent png base64
        png_b64 = base64.b64encode(
            bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
                          "0000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
        ).decode()
        r = requests.post(f"{BASE_URL}/api/messages",
                          json={"to_user_id": user_b["user"]["id"],
                                "image_base64": png_b64,
                                "text": ""},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("image_base64"), f"missing image_base64 in response: {body}"
        assert body.get("text", "") == ""

    def test_empty_message_rejected(self, user_a, user_b, friends_pair):
        r = requests.post(f"{BASE_URL}/api/messages",
                          json={"to_user_id": user_b["user"]["id"],
                                "image_base64": "",
                                "text": ""},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "empty" in r.text.lower()

    def test_oversize_image_rejected(self, user_a, user_b, friends_pair):
        # Backend checks decoded byte size > 6 MB. Send ~9 MB raw base64 → ~6.75 MB decoded.
        big = "A" * (9 * 1024 * 1024)
        r = requests.post(f"{BASE_URL}/api/messages",
                          json={"to_user_id": user_b["user"]["id"],
                                "image_base64": big,
                                "text": ""},
                          headers=_auth_headers(user_a["token"]))
        assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text[:200]}"

    def test_get_messages_contains_image(self, user_a, user_b, friends_pair):
        r = requests.get(f"{BASE_URL}/api/messages/{user_b['user']['id']}",
                         headers=_auth_headers(user_a["token"]))
        assert r.status_code == 200, r.text
        msgs = r.json()
        assert isinstance(msgs, list) and len(msgs) >= 1
        any_image = any(m.get("image_base64") for m in msgs)
        assert any_image, f"no image message found in history: {msgs}"
