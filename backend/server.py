from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
import uuid
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_DAYS = int(os.environ.get("JWT_EXPIRY_DAYS", "30"))

LLM_MODEL_PROVIDER = "anthropic"
LLM_MODEL_NAME = "claude-sonnet-4-6"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ClosetAI API")
api_router = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("closetai")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Default brand catalog
# ---------------------------------------------------------------------------
DEFAULT_BRANDS = [
    {"id": "amazon", "name": "Amazon Fashion", "url": "https://www.amazon.com/fashion", "popular": True},
    {"id": "myntra", "name": "Myntra", "url": "https://www.myntra.com", "popular": True},
    {"id": "zara", "name": "Zara", "url": "https://www.zara.com", "popular": True},
    {"id": "hm", "name": "H&M", "url": "https://www.hm.com", "popular": True},
    {"id": "asos", "name": "ASOS", "url": "https://www.asos.com", "popular": True},
    {"id": "nike", "name": "Nike", "url": "https://www.nike.com", "popular": True},
    {"id": "uniqlo", "name": "Uniqlo", "url": "https://www.uniqlo.com", "popular": True},
    {"id": "adidas", "name": "Adidas", "url": "https://www.adidas.com", "popular": True},
    {"id": "shein", "name": "Shein", "url": "https://www.shein.com", "popular": True},
    {"id": "nordstrom", "name": "Nordstrom", "url": "https://www.nordstrom.com", "popular": True},
]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=60)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    avatar: Optional[str] = None
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


CATEGORY_VALUES = ["tops", "bottoms", "outerwear", "shoes", "accessories", "dresses"]
PRIVACY_VALUES = ["public", "friends", "private"]


class WardrobeItemCreate(BaseModel):
    image_base64: str
    category: Literal["tops", "bottoms", "outerwear", "shoes", "accessories", "dresses"]
    name: Optional[str] = None
    color: Optional[str] = None
    rating: int = Field(default=3, ge=1, le=5)
    privacy: Literal["public", "friends", "private"] = "friends"
    tags: List[str] = []


class WardrobeItemUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    privacy: Optional[Literal["public", "friends", "private"]] = None
    category: Optional[Literal["tops", "bottoms", "outerwear", "shoes", "accessories", "dresses"]] = None
    tags: Optional[List[str]] = None


class WardrobeItem(BaseModel):
    id: str
    user_id: str
    image_base64: str
    category: str
    name: Optional[str] = None
    color: Optional[str] = None
    rating: int = 3
    privacy: str = "friends"
    tags: List[str] = []
    created_at: str


class OutfitChatBody(BaseModel):
    message: str
    session_id: Optional[str] = None
    weather: Optional[str] = None
    occasion: Optional[str] = None


class OutfitChatResponse(BaseModel):
    reply: str
    session_id: str
    recommended_item_ids: List[str] = []


class WishlistCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_price: Optional[float] = None
    image_base64: Optional[str] = None
    link: Optional[str] = None


class WishlistItem(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    target_price: Optional[float] = None
    image_base64: Optional[str] = None
    link: Optional[str] = None
    price_results: Optional[List[dict]] = None
    last_checked: Optional[str] = None
    created_at: str


class BrandCreate(BaseModel):
    name: str
    url: str


class Brand(BaseModel):
    id: str
    name: str
    url: str
    popular: bool = False
    user_added: bool = False


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: str  # ISO datetime
    location: Optional[str] = None
    weather: Optional[str] = None


class EventItem(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    date: str
    location: Optional[str] = None
    weather: Optional[str] = None
    suggested_item_ids: List[str] = []
    suggestion_note: Optional[str] = None
    created_at: str


class FriendRequestBody(BaseModel):
    email: EmailStr


class FriendAccessUpdate(BaseModel):
    access_level: Literal["full", "limited", "none"]


class FriendItem(BaseModel):
    id: str  # friendship id
    friend_user_id: str
    friend_email: str
    friend_name: str
    friend_avatar: Optional[str] = None
    access_level: str
    status: str  # pending, accepted
    direction: str  # incoming, outgoing, friends
    created_at: str


class MessageCreate(BaseModel):
    to_user_id: str
    text: str
    recommended_item_id: Optional[str] = None  # if recommending an outfit item


class MessageItem(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    text: str
    recommended_item_id: Optional[str] = None
    recommended_item_snapshot: Optional[dict] = None
    created_at: str
    read: bool = False


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def user_to_public(user: dict) -> UserPublic:
    return UserPublic(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        avatar=user.get("avatar"),
        created_at=user["created_at"],
    )


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
def _make_chat(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(LLM_MODEL_PROVIDER, LLM_MODEL_NAME)


async def _llm_send(chat: LlmChat, user_msg: UserMessage) -> str:
    # Run synchronous-blocking guard with a timeout
    try:
        return await asyncio.wait_for(chat.send_message(user_msg), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except Exception as e:  # surface to client
        logger.exception("LLM error")
        raise HTTPException(status_code=502, detail=f"LLM error: {str(e)[:200]}")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(body: SignupBody):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "avatar": None,
        "created_at": utc_now(),
    }
    await db.users.insert_one(user)
    # seed default brands for this user (none — brands are global popular + per-user custom)
    token = create_token(user["id"])
    return AuthResponse(token=token, user=user_to_public(user))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    return AuthResponse(token=token, user=user_to_public(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


# ---------------------------------------------------------------------------
# Wardrobe routes
# ---------------------------------------------------------------------------
def _wardrobe_doc_to_model(d: dict) -> WardrobeItem:
    return WardrobeItem(**{k: d.get(k) for k in WardrobeItem.model_fields.keys()})


@api_router.post("/wardrobe", response_model=WardrobeItem)
async def create_wardrobe_item(body: WardrobeItemCreate, user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "image_base64": body.image_base64,
        "category": body.category,
        "name": body.name,
        "color": body.color,
        "rating": body.rating,
        "privacy": body.privacy,
        "tags": body.tags,
        "created_at": utc_now(),
    }
    await db.wardrobe.insert_one(item)
    return _wardrobe_doc_to_model(item)


@api_router.get("/wardrobe", response_model=List[WardrobeItem])
async def list_wardrobe(
    category: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q: dict = {"user_id": user["id"]}
    if category:
        q["category"] = category
    docs = await db.wardrobe.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_wardrobe_doc_to_model(d) for d in docs]


@api_router.get("/wardrobe/{item_id}", response_model=WardrobeItem)
async def get_wardrobe_item(item_id: str, user: dict = Depends(get_current_user)):
    doc = await db.wardrobe.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return _wardrobe_doc_to_model(doc)


@api_router.patch("/wardrobe/{item_id}", response_model=WardrobeItem)
async def update_wardrobe_item(item_id: str, body: WardrobeItemUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        doc = await db.wardrobe.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Item not found")
        return _wardrobe_doc_to_model(doc)
    res = await db.wardrobe.find_one_and_update(
        {"id": item_id, "user_id": user["id"]},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Item not found")
    return _wardrobe_doc_to_model(res)


@api_router.delete("/wardrobe/{item_id}")
async def delete_wardrobe_item(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.wardrobe.delete_one({"id": item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Outfit AI chat
# ---------------------------------------------------------------------------
OUTFIT_SYSTEM_PROMPT = (
    "You are ClosetAI, a personal fashion stylist. The user has a wardrobe of items with categories "
    "(tops, bottoms, outerwear, shoes, accessories, dresses), each with a self-rating from 1-5 "
    "(higher rating = the user likes it more). "
    "Given the user's request (with weather and occasion if provided), recommend a complete outfit "
    "by referencing items from their wardrobe by item id (format: ITEM:<id>). "
    "Prefer items with higher ratings. Be warm, concise, and stylish in tone. "
    "Always end with a short 'Why it works' sentence. "
    "If the wardrobe is missing key pieces, suggest what they might buy."
)


def _format_wardrobe_for_prompt(items: List[dict]) -> str:
    if not items:
        return "(empty wardrobe)"
    lines = []
    for it in items:
        lines.append(
            f"- ITEM:{it['id']} | {it.get('category')} | name={it.get('name') or 'unnamed'} "
            f"| color={it.get('color') or 'unknown'} | rating={it.get('rating', 3)}/5"
        )
    return "\n".join(lines)


@api_router.post("/outfit/chat", response_model=OutfitChatResponse)
async def outfit_chat(body: OutfitChatBody, user: dict = Depends(get_current_user)):
    session_id = body.session_id or f"outfit-{user['id']}-{uuid.uuid4()}"
    wardrobe = await db.wardrobe.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    wardrobe_text = _format_wardrobe_for_prompt(wardrobe)
    system_msg = (
        f"{OUTFIT_SYSTEM_PROMPT}\n\nUSER'S WARDROBE:\n{wardrobe_text}\n\n"
        f"The user's name is {user['name']}."
    )
    chat = _make_chat(session_id, system_msg)
    context_parts = []
    if body.weather:
        context_parts.append(f"Weather: {body.weather}")
    if body.occasion:
        context_parts.append(f"Occasion: {body.occasion}")
    context = "\n".join(context_parts)
    full_msg = f"{context}\n\nUser: {body.message}" if context else body.message
    reply_text = await _llm_send(chat, UserMessage(text=full_msg))
    # Extract recommended item ids from reply: "ITEM:<uuid>"
    import re
    rec_ids = list({m for m in re.findall(r"ITEM:([0-9a-fA-F-]{36})", reply_text)})
    # filter to actual ids in user's wardrobe
    valid_ids = {it["id"] for it in wardrobe}
    rec_ids = [r for r in rec_ids if r in valid_ids]
    # persist chat history
    await db.outfit_chats.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "session_id": session_id,
        "user_message": body.message,
        "weather": body.weather,
        "occasion": body.occasion,
        "reply": reply_text,
        "recommended_item_ids": rec_ids,
        "created_at": utc_now(),
    })
    return OutfitChatResponse(reply=reply_text, session_id=session_id, recommended_item_ids=rec_ids)


@api_router.get("/outfit/history")
async def outfit_history(user: dict = Depends(get_current_user), limit: int = 30):
    docs = await db.outfit_chats.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ---------------------------------------------------------------------------
# Wishlist + price comparison
# ---------------------------------------------------------------------------
def _wish_doc_to_model(d: dict) -> WishlistItem:
    return WishlistItem(**{k: d.get(k) for k in WishlistItem.model_fields.keys()})


@api_router.post("/wishlist", response_model=WishlistItem)
async def create_wishlist(body: WishlistCreate, user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name,
        "description": body.description,
        "target_price": body.target_price,
        "image_base64": body.image_base64,
        "link": body.link,
        "price_results": None,
        "last_checked": None,
        "created_at": utc_now(),
    }
    await db.wishlist.insert_one(item)
    return _wish_doc_to_model(item)


@api_router.get("/wishlist", response_model=List[WishlistItem])
async def list_wishlist(user: dict = Depends(get_current_user)):
    docs = await db.wishlist.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_wish_doc_to_model(d) for d in docs]


@api_router.delete("/wishlist/{item_id}")
async def delete_wishlist(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.wishlist.delete_one({"id": item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


PRICE_SYSTEM_PROMPT = (
    "You are a shopping research assistant. Given an item description and a list of shopping websites, "
    "provide your best estimate of the typical price range on each site (in USD) and which site is likely "
    "the cheapest and most accessible. Respond in strict JSON with this schema: "
    '{"results":[{"site":"<name>","url":"<url>","estimated_price_low":<number>,"estimated_price_high":<number>,'
    '"availability":"<high|medium|low>","note":"<short>"}],"best_pick":"<site name>","reasoning":"<one sentence>"}'
    " Do not include any text outside the JSON."
)


@api_router.post("/wishlist/{item_id}/compare", response_model=WishlistItem)
async def compare_wishlist_prices(item_id: str, user: dict = Depends(get_current_user)):
    item = await db.wishlist.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # collect brand list = default popular + user-added
    user_brands = await db.brands.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    brand_list = DEFAULT_BRANDS + [
        {"id": b["id"], "name": b["name"], "url": b["url"], "popular": False} for b in user_brands
    ]
    brand_text = "\n".join([f"- {b['name']} ({b['url']})" for b in brand_list])
    target = f"target price ${item['target_price']}" if item.get("target_price") else "no target price"
    user_msg = (
        f"Find best price for: {item['name']}\n"
        f"Description: {item.get('description') or 'n/a'}\n"
        f"{target}\n\nShopping sites to evaluate:\n{brand_text}"
    )
    chat = _make_chat(f"price-{item_id}-{uuid.uuid4()}", PRICE_SYSTEM_PROMPT)
    raw = await _llm_send(chat, UserMessage(text=user_msg))
    # Parse JSON; tolerate code fences
    import json
    import re
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except Exception:
        parsed = {"results": [], "best_pick": None, "reasoning": raw[:500]}
    results = parsed.get("results") or []
    # attach best_pick / reasoning to the first item or as meta
    if parsed.get("best_pick"):
        results = [{**r, "is_best_pick": r.get("site") == parsed.get("best_pick")} for r in results]
    item_update = {
        "price_results": results,
        "best_pick": parsed.get("best_pick"),
        "reasoning": parsed.get("reasoning"),
        "last_checked": utc_now(),
    }
    await db.wishlist.update_one({"id": item_id, "user_id": user["id"]}, {"$set": item_update})
    updated = await db.wishlist.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
    return _wish_doc_to_model(updated)


# ---------------------------------------------------------------------------
# Brands
# ---------------------------------------------------------------------------
@api_router.get("/brands", response_model=List[Brand])
async def list_brands(user: dict = Depends(get_current_user)):
    defaults = [Brand(**b, user_added=False) for b in DEFAULT_BRANDS]
    user_brands_docs = await db.brands.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    user_brands = [Brand(id=b["id"], name=b["name"], url=b["url"], popular=False, user_added=True) for b in user_brands_docs]
    return defaults + user_brands


@api_router.post("/brands", response_model=Brand)
async def add_brand(body: BrandCreate, user: dict = Depends(get_current_user)):
    brand = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name.strip(),
        "url": body.url.strip(),
        "created_at": utc_now(),
    }
    await db.brands.insert_one(brand)
    return Brand(id=brand["id"], name=brand["name"], url=brand["url"], popular=False, user_added=True)


@api_router.delete("/brands/{brand_id}")
async def delete_brand(brand_id: str, user: dict = Depends(get_current_user)):
    res = await db.brands.delete_one({"id": brand_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Calendar events + per-event outfit suggestion
# ---------------------------------------------------------------------------
def _event_doc_to_model(d: dict) -> EventItem:
    return EventItem(**{k: d.get(k) for k in EventItem.model_fields.keys()})


@api_router.post("/events", response_model=EventItem)
async def create_event(body: EventCreate, user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": body.title,
        "description": body.description,
        "date": body.date,
        "location": body.location,
        "weather": body.weather,
        "suggested_item_ids": [],
        "suggestion_note": None,
        "created_at": utc_now(),
    }
    await db.events.insert_one(item)
    return _event_doc_to_model(item)


@api_router.get("/events", response_model=List[EventItem])
async def list_events(user: dict = Depends(get_current_user)):
    docs = await db.events.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(500)
    return [_event_doc_to_model(d) for d in docs]


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    res = await db.events.delete_one({"id": event_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


@api_router.post("/events/{event_id}/suggest", response_model=EventItem)
async def suggest_event_outfit(event_id: str, user: dict = Depends(get_current_user)):
    event = await db.events.find_one({"id": event_id, "user_id": user["id"]}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    wardrobe = await db.wardrobe.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    wardrobe_text = _format_wardrobe_for_prompt(wardrobe)
    system_msg = OUTFIT_SYSTEM_PROMPT + f"\n\nUSER'S WARDROBE:\n{wardrobe_text}"
    chat = _make_chat(f"event-{event_id}-{uuid.uuid4()}", system_msg)
    msg = (
        f"Suggest an outfit for this event:\n"
        f"Title: {event['title']}\n"
        f"Date: {event['date']}\n"
        f"Location: {event.get('location') or 'n/a'}\n"
        f"Weather: {event.get('weather') or 'n/a'}\n"
        f"Description: {event.get('description') or 'n/a'}\n"
        f"List 2-4 specific items from the wardrobe by ITEM:<id> and explain in 2 sentences."
    )
    reply = await _llm_send(chat, UserMessage(text=msg))
    import re
    rec_ids = list({m for m in re.findall(r"ITEM:([0-9a-fA-F-]{36})", reply)})
    valid_ids = {it["id"] for it in wardrobe}
    rec_ids = [r for r in rec_ids if r in valid_ids]
    await db.events.update_one(
        {"id": event_id, "user_id": user["id"]},
        {"$set": {"suggested_item_ids": rec_ids, "suggestion_note": reply}},
    )
    updated = await db.events.find_one({"id": event_id, "user_id": user["id"]}, {"_id": 0})
    return _event_doc_to_model(updated)


# ---------------------------------------------------------------------------
# Friends
# ---------------------------------------------------------------------------
def _friendship_to_item(doc: dict, current_user_id: str, friend_user: dict) -> FriendItem:
    status_val = doc["status"]
    if status_val == "accepted":
        direction = "friends"
    elif doc["requester_id"] == current_user_id:
        direction = "outgoing"
    else:
        direction = "incoming"
    return FriendItem(
        id=doc["id"],
        friend_user_id=friend_user["id"],
        friend_email=friend_user["email"],
        friend_name=friend_user["name"],
        friend_avatar=friend_user.get("avatar"),
        access_level=doc.get("access_levels", {}).get(current_user_id, "limited"),
        status=status_val,
        direction=direction,
        created_at=doc["created_at"],
    )


@api_router.post("/friends/request", response_model=FriendItem)
async def send_friend_request(body: FriendRequestBody, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No user with that email")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    # Check if friendship exists either way
    existing = await db.friendships.find_one({
        "user_ids": {"$all": [user["id"], target["id"]]},
    }, {"_id": 0})
    if existing:
        return _friendship_to_item(existing, user["id"], target)
    doc = {
        "id": str(uuid.uuid4()),
        "requester_id": user["id"],
        "addressee_id": target["id"],
        "user_ids": [user["id"], target["id"]],
        "status": "pending",
        "access_levels": {user["id"]: "limited", target["id"]: "limited"},
        "created_at": utc_now(),
    }
    await db.friendships.insert_one(doc)
    return _friendship_to_item(doc, user["id"], target)


@api_router.post("/friends/{friendship_id}/accept", response_model=FriendItem)
async def accept_friend(friendship_id: str, user: dict = Depends(get_current_user)):
    doc = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not doc or doc["addressee_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already handled")
    await db.friendships.update_one({"id": friendship_id}, {"$set": {"status": "accepted"}})
    updated = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    other_id = doc["requester_id"]
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    return _friendship_to_item(updated, user["id"], other)


@api_router.delete("/friends/{friendship_id}")
async def remove_friend(friendship_id: str, user: dict = Depends(get_current_user)):
    doc = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not doc or user["id"] not in doc["user_ids"]:
        raise HTTPException(status_code=404, detail="Not found")
    await db.friendships.delete_one({"id": friendship_id})
    return {"ok": True}


@api_router.get("/friends", response_model=List[FriendItem])
async def list_friends(user: dict = Depends(get_current_user)):
    docs = await db.friendships.find({"user_ids": user["id"]}, {"_id": 0}).to_list(500)
    items = []
    for d in docs:
        other_id = d["requester_id"] if d["addressee_id"] == user["id"] else d["addressee_id"]
        other = await db.users.find_one({"id": other_id}, {"_id": 0})
        if other:
            items.append(_friendship_to_item(d, user["id"], other))
    return items


@api_router.patch("/friends/{friendship_id}/access", response_model=FriendItem)
async def update_friend_access(friendship_id: str, body: FriendAccessUpdate, user: dict = Depends(get_current_user)):
    doc = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not doc or user["id"] not in doc["user_ids"]:
        raise HTTPException(status_code=404, detail="Not found")
    access_levels = doc.get("access_levels", {})
    access_levels[user["id"]] = body.access_level
    await db.friendships.update_one({"id": friendship_id}, {"$set": {"access_levels": access_levels}})
    other_id = doc["requester_id"] if doc["addressee_id"] == user["id"] else doc["addressee_id"]
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    updated = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    return _friendship_to_item(updated, user["id"], other)


async def _check_access(viewer_id: str, owner_id: str) -> str:
    """Returns access level the OWNER has granted to the VIEWER. Self-access is 'full'."""
    if viewer_id == owner_id:
        return "full"
    doc = await db.friendships.find_one({
        "user_ids": {"$all": [viewer_id, owner_id]},
        "status": "accepted",
    }, {"_id": 0})
    if not doc:
        return "none"
    return doc.get("access_levels", {}).get(owner_id, "limited")


@api_router.get("/friends/{friend_user_id}/wardrobe", response_model=List[WardrobeItem])
async def view_friend_wardrobe(friend_user_id: str, user: dict = Depends(get_current_user)):
    access = await _check_access(user["id"], friend_user_id)
    if access == "none":
        raise HTTPException(status_code=403, detail="No access to this wardrobe")
    q: dict = {"user_id": friend_user_id}
    if access == "limited":
        q["privacy"] = {"$in": ["public", "friends"]}
        q["rating"] = {"$gte": 4}  # limited = only highly-rated items
    elif access == "full":
        q["privacy"] = {"$in": ["public", "friends"]}
    docs = await db.wardrobe.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_wardrobe_doc_to_model(d) for d in docs]


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------
def _msg_doc_to_model(d: dict) -> MessageItem:
    return MessageItem(**{k: d.get(k) for k in MessageItem.model_fields.keys()})


@api_router.post("/messages", response_model=MessageItem)
async def send_message(body: MessageCreate, user: dict = Depends(get_current_user)):
    # Must be friends
    friendship = await db.friendships.find_one({
        "user_ids": {"$all": [user["id"], body.to_user_id]},
        "status": "accepted",
    }, {"_id": 0})
    if not friendship:
        raise HTTPException(status_code=403, detail="You can only message friends")

    snapshot = None
    if body.recommended_item_id:
        # snapshot the item (could be either user's item)
        item = await db.wardrobe.find_one({"id": body.recommended_item_id}, {"_id": 0})
        if item:
            snapshot = {
                "id": item["id"],
                "category": item.get("category"),
                "name": item.get("name"),
                "color": item.get("color"),
                "image_base64": item.get("image_base64"),
            }
    msg = {
        "id": str(uuid.uuid4()),
        "from_user_id": user["id"],
        "to_user_id": body.to_user_id,
        "text": body.text,
        "recommended_item_id": body.recommended_item_id,
        "recommended_item_snapshot": snapshot,
        "created_at": utc_now(),
        "read": False,
    }
    await db.messages.insert_one(msg)
    return _msg_doc_to_model(msg)


@api_router.get("/messages/{friend_user_id}", response_model=List[MessageItem])
async def get_messages(friend_user_id: str, user: dict = Depends(get_current_user)):
    docs = await db.messages.find(
        {"$or": [
            {"from_user_id": user["id"], "to_user_id": friend_user_id},
            {"from_user_id": friend_user_id, "to_user_id": user["id"]},
        ]},
        {"_id": 0},
    ).sort("created_at", 1).to_list(1000)
    # mark inbound as read
    await db.messages.update_many(
        {"from_user_id": friend_user_id, "to_user_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return [_msg_doc_to_model(d) for d in docs]


@api_router.get("/messages")
async def list_threads(user: dict = Depends(get_current_user)):
    """Latest message per conversation partner."""
    pipeline = [
        {"$match": {"$or": [{"from_user_id": user["id"]}, {"to_user_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {
                "$cond": [
                    {"$eq": ["$from_user_id", user["id"]]},
                    "$to_user_id",
                    "$from_user_id",
                ]
            },
            "last_message": {"$first": "$$ROOT"},
            "unread_count": {
                "$sum": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$to_user_id", user["id"]]},
                            {"$eq": ["$read", False]},
                        ]},
                        1,
                        0,
                    ]
                }
            },
        }},
    ]
    threads = await db.messages.aggregate(pipeline).to_list(500)
    out = []
    for t in threads:
        partner = await db.users.find_one({"id": t["_id"]}, {"_id": 0, "password_hash": 0})
        if not partner:
            continue
        lm = t["last_message"]
        lm.pop("_id", None)
        out.append({
            "partner": {
                "id": partner["id"],
                "name": partner["name"],
                "email": partner["email"],
                "avatar": partner.get("avatar"),
            },
            "last_message": {
                "id": lm["id"],
                "text": lm["text"],
                "from_user_id": lm["from_user_id"],
                "created_at": lm["created_at"],
            },
            "unread_count": t["unread_count"],
        })
    return out


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"app": "ClosetAI", "status": "ok"}


# ---------------------------------------------------------------------------
# Register router + middleware
# ---------------------------------------------------------------------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
