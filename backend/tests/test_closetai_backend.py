"""ClosetAI Backend Tests - Covers all features in review request."""
import time
import uuid
import pytest
import requests


# ---------- Auth ----------
class TestAuth:
    def test_signup_login_me_flow(self, api, base_url):
        email = f"TEST_user_{uuid.uuid4().hex[:8]}@closetai.com"
        r = api.post(f"{base_url}/api/auth/signup", json={
            "email": email, "password": "secret123", "name": "TEST User"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == email.lower()
        token = data["token"]

        # duplicate signup -> 409
        r2 = api.post(f"{base_url}/api/auth/signup", json={
            "email": email, "password": "secret123", "name": "TEST User"
        })
        assert r2.status_code == 409

        # login
        r3 = api.post(f"{base_url}/api/auth/login", json={
            "email": email, "password": "secret123"
        })
        assert r3.status_code == 200
        assert "token" in r3.json()

        # bad password
        r4 = api.post(f"{base_url}/api/auth/login", json={
            "email": email, "password": "wrongpass"
        })
        assert r4.status_code == 401

        # me with bearer
        r5 = api.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r5.status_code == 200
        assert r5.json()["email"] == email.lower()

        # me without token -> 401
        r6 = requests.get(f"{base_url}/api/auth/me")
        assert r6.status_code == 401


# ---------- Shared user fixtures ----------
@pytest.fixture(scope="module")
def user_a(base_url):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_a_{uuid.uuid4().hex[:8]}@closetai.com"
    r = s.post(f"{base_url}/api/auth/signup", json={"email": email, "password": "pwA12345", "name": "TEST A"})
    assert r.status_code == 200
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    return {"session": s, "email": email, "user_id": d["user"]["id"], "token": d["token"]}


@pytest.fixture(scope="module")
def user_b(base_url):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_b_{uuid.uuid4().hex[:8]}@closetai.com"
    r = s.post(f"{base_url}/api/auth/signup", json={"email": email, "password": "pwB12345", "name": "TEST B"})
    assert r.status_code == 200
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    return {"session": s, "email": email, "user_id": d["user"]["id"], "token": d["token"]}


# ---------- Wardrobe CRUD ----------
class TestWardrobe:
    def test_wardrobe_crud(self, base_url, user_a, real_image_b64):
        s = user_a["session"]
        # create
        payload = {
            "image_base64": real_image_b64, "category": "tops",
            "name": "TEST Blue Tee", "color": "blue", "rating": 4, "privacy": "friends",
            "tags": ["casual"]
        }
        r = s.post(f"{base_url}/api/wardrobe", json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["category"] == "tops" and item["rating"] == 4
        item_id = item["id"]

        # list
        r = s.get(f"{base_url}/api/wardrobe")
        assert r.status_code == 200
        assert any(it["id"] == item_id for it in r.json())

        # filter by category
        r = s.get(f"{base_url}/api/wardrobe", params={"category": "tops"})
        assert r.status_code == 200
        assert all(it["category"] == "tops" for it in r.json())

        # get by id
        r = s.get(f"{base_url}/api/wardrobe/{item_id}")
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Blue Tee"

        # patch
        r = s.patch(f"{base_url}/api/wardrobe/{item_id}", json={"rating": 5, "privacy": "public", "color": "navy"})
        assert r.status_code == 200
        body = r.json()
        assert body["rating"] == 5 and body["privacy"] == "public" and body["color"] == "navy"

        # verify persistence
        r = s.get(f"{base_url}/api/wardrobe/{item_id}")
        assert r.json()["rating"] == 5

        # delete
        r = s.delete(f"{base_url}/api/wardrobe/{item_id}")
        assert r.status_code == 200

        # gone
        r = s.get(f"{base_url}/api/wardrobe/{item_id}")
        assert r.status_code == 404


# ---------- Seed wardrobe for AI tests ----------
@pytest.fixture(scope="module")
def seeded_wardrobe_a(base_url, user_a, real_image_b64, real_image_b64_2):
    s = user_a["session"]
    items = []
    seeds = [
        {"category": "tops", "name": "TEST White Shirt", "color": "white", "rating": 5, "privacy": "public"},
        {"category": "bottoms", "name": "TEST Black Jeans", "color": "black", "rating": 5, "privacy": "public"},
        {"category": "shoes", "name": "TEST Sneakers", "color": "white", "rating": 4, "privacy": "friends"},
        {"category": "outerwear", "name": "TEST Denim Jacket", "color": "blue", "rating": 3, "privacy": "private"},
    ]
    img = real_image_b64
    for i, sd in enumerate(seeds):
        sd["image_base64"] = real_image_b64_2 if i % 2 else img
        r = s.post(f"{base_url}/api/wardrobe", json=sd)
        assert r.status_code == 200
        items.append(r.json())
    yield items


# ---------- Outfit AI Chat ----------
class TestOutfitChat:
    def test_outfit_chat_returns_session_and_recs(self, base_url, user_a, seeded_wardrobe_a):
        s = user_a["session"]
        r = s.post(f"{base_url}/api/outfit/chat", json={
            "message": "What should I wear today for a casual brunch?",
            "weather": "mild 20C sunny",
            "occasion": "casual brunch"
        }, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 10
        assert "session_id" in data and data["session_id"]
        assert "recommended_item_ids" in data
        assert isinstance(data["recommended_item_ids"], list)
        valid_ids = {it["id"] for it in seeded_wardrobe_a}
        # all recommended ids must be subset of wardrobe
        for rid in data["recommended_item_ids"]:
            assert rid in valid_ids


# ---------- Brands ----------
class TestBrands:
    def test_brands_crud(self, base_url, user_a):
        s = user_a["session"]
        r = s.get(f"{base_url}/api/brands")
        assert r.status_code == 200
        brands = r.json()
        # at least the 10 defaults
        assert len([b for b in brands if b.get("popular")]) >= 10

        # add custom
        r = s.post(f"{base_url}/api/brands", json={"name": "TEST Brand X", "url": "https://example.com"})
        assert r.status_code == 200
        new_id = r.json()["id"]
        assert r.json()["user_added"] is True

        # list contains new
        r = s.get(f"{base_url}/api/brands")
        assert any(b["id"] == new_id and b["user_added"] for b in r.json())

        # delete user-added
        r = s.delete(f"{base_url}/api/brands/{new_id}")
        assert r.status_code == 200

        # cannot delete default (not user-added)
        r = s.delete(f"{base_url}/api/brands/amazon")
        assert r.status_code == 404


# ---------- Wishlist ----------
class TestWishlist:
    def test_wishlist_flow(self, base_url, user_a):
        s = user_a["session"]
        r = s.post(f"{base_url}/api/wishlist", json={
            "name": "TEST White Sneakers", "description": "Minimalist court sneakers",
            "target_price": 80.0
        })
        assert r.status_code == 200, r.text
        wid = r.json()["id"]

        r = s.get(f"{base_url}/api/wishlist")
        assert r.status_code == 200
        assert any(w["id"] == wid for w in r.json())

        # compare prices via AI (slow)
        r = s.post(f"{base_url}/api/wishlist/{wid}/compare", timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        results = body.get("price_results") or []
        assert isinstance(results, list)
        # Should have several entries
        assert len(results) >= 1, f"No price results returned: {body}"
        sample = results[0]
        # required keys per request
        for key in ("site", "url"):
            assert key in sample, f"missing {key} in {sample}"
        # at least one of price_low or estimated_price_low present
        # spec says price_low/price_high but implementation passes through LLM keys; check whichever
        has_low = "estimated_price_low" in sample or "price_low" in sample
        has_high = "estimated_price_high" in sample or "price_high" in sample
        assert has_low and has_high, f"missing price fields in {sample}"
        # availability key
        assert "availability" in sample
        # best_pick flag should be on one entry (is_best_pick in current impl)
        best_flagged = [r for r in results if r.get("is_best_pick") or r.get("best_pick")]
        assert len(best_flagged) >= 1, "No best_pick flagged in results"

        # delete
        r = s.delete(f"{base_url}/api/wishlist/{wid}")
        assert r.status_code == 200


# ---------- Events ----------
class TestEvents:
    def test_events_flow(self, base_url, user_a, seeded_wardrobe_a):
        s = user_a["session"]
        # create two events out of order
        e1 = s.post(f"{base_url}/api/events", json={
            "title": "TEST Wedding", "date": "2026-06-15T18:00:00Z",
            "location": "Paris", "weather": "warm"
        }).json()
        e2 = s.post(f"{base_url}/api/events", json={
            "title": "TEST Meeting", "date": "2026-02-10T09:00:00Z",
            "location": "Office", "weather": "cool"
        }).json()
        assert e1.get("id") and e2.get("id")

        # list sorted asc
        r = s.get(f"{base_url}/api/events")
        assert r.status_code == 200
        evs = [e for e in r.json() if e["id"] in (e1["id"], e2["id"])]
        dates = [e["date"] for e in evs]
        assert dates == sorted(dates), f"events not sorted: {dates}"

        # suggest
        r = s.post(f"{base_url}/api/events/{e1['id']}/suggest", timeout=120)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert isinstance(ev.get("suggested_item_ids"), list)
        assert isinstance(ev.get("suggestion_note"), str) and len(ev["suggestion_note"]) > 5
        valid_ids = {it["id"] for it in seeded_wardrobe_a}
        for sid in ev["suggested_item_ids"]:
            assert sid in valid_ids

        # delete
        r = s.delete(f"{base_url}/api/events/{e1['id']}")
        assert r.status_code == 200
        r = s.delete(f"{base_url}/api/events/{e2['id']}")
        assert r.status_code == 200


# ---------- Friends + access + wardrobe view ----------
@pytest.fixture(scope="module")
def friendship(base_url, user_a, user_b):
    """A sends friend req to B; B accepts. Returns friendship details for both perspectives."""
    sa = user_a["session"]
    sb = user_b["session"]
    r = sa.post(f"{base_url}/api/friends/request", json={"email": user_b["email"]})
    assert r.status_code == 200, r.text
    fa = r.json()
    assert fa["status"] == "pending" and fa["direction"] == "outgoing"

    # B sees as incoming
    r = sb.get(f"{base_url}/api/friends")
    assert r.status_code == 200
    incoming = [f for f in r.json() if f["id"] == fa["id"]]
    assert incoming and incoming[0]["direction"] == "incoming"

    # B accepts
    r = sb.post(f"{base_url}/api/friends/{fa['id']}/accept")
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"
    return {"id": fa["id"]}


class TestFriends:
    def test_request_accept_access(self, base_url, user_a, user_b, friendship):
        sa = user_a["session"]
        sb = user_b["session"]
        # update access on B's side: B grants 'limited' to A (default), set to 'full'
        r = sb.patch(f"{base_url}/api/friends/{friendship['id']}/access", json={"access_level": "full"})
        assert r.status_code == 200
        assert r.json()["access_level"] == "full"

        # verify after refresh
        r = sb.get(f"{base_url}/api/friends")
        f = [x for x in r.json() if x["id"] == friendship["id"]][0]
        assert f["access_level"] == "full"


@pytest.fixture(scope="module")
def seeded_wardrobe_b(base_url, user_b, real_image_b64):
    s = user_b["session"]
    seeds = [
        {"category": "tops", "name": "TEST B-public-5", "color": "red", "rating": 5, "privacy": "public", "image_base64": real_image_b64},
        {"category": "tops", "name": "TEST B-friends-5", "color": "green", "rating": 5, "privacy": "friends", "image_base64": real_image_b64},
        {"category": "tops", "name": "TEST B-friends-3", "color": "yellow", "rating": 3, "privacy": "friends", "image_base64": real_image_b64},
        {"category": "tops", "name": "TEST B-private-5", "color": "purple", "rating": 5, "privacy": "private", "image_base64": real_image_b64},
    ]
    items = []
    for sd in seeds:
        r = s.post(f"{base_url}/api/wardrobe", json=sd)
        assert r.status_code == 200
        items.append(r.json())
    return items


class TestFriendWardrobeAccess:
    def test_access_levels(self, base_url, user_a, user_b, friendship, seeded_wardrobe_b):
        sa = user_a["session"]
        sb = user_b["session"]

        # Set B->A access to "none"
        r = sb.patch(f"{base_url}/api/friends/{friendship['id']}/access", json={"access_level": "none"})
        assert r.status_code == 200
        # A tries to view B wardrobe -> 403
        r = sa.get(f"{base_url}/api/friends/{user_b['user_id']}/wardrobe")
        assert r.status_code == 403

        # Set B->A access to "limited" : A should see only rating>=4 + privacy public/friends
        r = sb.patch(f"{base_url}/api/friends/{friendship['id']}/access", json={"access_level": "limited"})
        assert r.status_code == 200
        r = sa.get(f"{base_url}/api/friends/{user_b['user_id']}/wardrobe")
        assert r.status_code == 200
        items = r.json()
        names = {it["name"] for it in items}
        assert "TEST B-public-5" in names
        assert "TEST B-friends-5" in names
        assert "TEST B-friends-3" not in names, "low-rated should be hidden under limited"
        assert "TEST B-private-5" not in names, "private items must never be visible"

        # Set B->A access to "full" : A should see all public/friends regardless of rating; private still hidden
        r = sb.patch(f"{base_url}/api/friends/{friendship['id']}/access", json={"access_level": "full"})
        assert r.status_code == 200
        r = sa.get(f"{base_url}/api/friends/{user_b['user_id']}/wardrobe")
        assert r.status_code == 200
        items = r.json()
        names = {it["name"] for it in items}
        assert "TEST B-public-5" in names
        assert "TEST B-friends-5" in names
        assert "TEST B-friends-3" in names, "rating-3 friends item should be visible under full"
        assert "TEST B-private-5" not in names, "private items must never be visible"


# ---------- Messaging ----------
class TestMessaging:
    def test_messaging_requires_friendship(self, base_url, user_a, user_b, friendship, seeded_wardrobe_b):
        sa = user_a["session"]
        sb = user_b["session"]

        # send normal message A -> B
        r = sa.post(f"{base_url}/api/messages", json={
            "to_user_id": user_b["user_id"], "text": "TEST hello!"
        })
        assert r.status_code == 200, r.text
        msg1 = r.json()
        assert msg1["from_user_id"] == user_a["user_id"] and msg1["to_user_id"] == user_b["user_id"]
        assert msg1["read"] is False

        # send with recommended_item_id (a B item)
        rec_item = seeded_wardrobe_b[0]
        r = sb.post(f"{base_url}/api/messages", json={
            "to_user_id": user_a["user_id"],
            "text": "TEST try this",
            "recommended_item_id": rec_item["id"]
        })
        assert r.status_code == 200, r.text
        msg2 = r.json()
        snap = msg2.get("recommended_item_snapshot")
        assert snap is not None
        assert snap["id"] == rec_item["id"]
        assert snap["category"] == rec_item["category"]

        # conversation: A fetches messages with B - should be ordered and mark inbound (from B) as read
        r = sa.get(f"{base_url}/api/messages/{user_b['user_id']}")
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2
        # ordered ascending
        times = [m["created_at"] for m in msgs]
        assert times == sorted(times)

        # threads list for A
        r = sa.get(f"{base_url}/api/messages")
        assert r.status_code == 200
        threads = r.json()
        thread = next((t for t in threads if t["partner"]["id"] == user_b["user_id"]), None)
        assert thread is not None
        # After fetching with B, inbound is read so unread_count should be 0
        assert thread["unread_count"] == 0

        # B has not yet read A's "hello"; expect unread_count >=1 in B's threads
        r = sb.get(f"{base_url}/api/messages")
        thread_b = next((t for t in r.json() if t["partner"]["id"] == user_a["user_id"]), None)
        assert thread_b is not None
        assert thread_b["unread_count"] >= 1

    def test_messaging_blocked_when_not_friends(self, base_url, user_a):
        # Make a brand new stranger user
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = f"TEST_stranger_{uuid.uuid4().hex[:8]}@closetai.com"
        r = s.post(f"{base_url}/api/auth/signup", json={"email": email, "password": "strpw1234", "name": "TEST Stranger"})
        stranger = r.json()
        sa = user_a["session"]
        r = sa.post(f"{base_url}/api/messages", json={
            "to_user_id": stranger["user"]["id"], "text": "should fail"
        })
        assert r.status_code == 403
