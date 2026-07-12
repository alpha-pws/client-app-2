from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import time
import bcrypt
import jwt
import uuid
import re as _re
import hmac
import hashlib
import secrets
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

import resend
import httpx
from openai import AsyncOpenAI

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_DAYS = int(os.environ.get("JWT_EXPIRY_DAYS", "30"))
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "ClosetAI <onboarding@resend.dev>")
APP_NAME = os.environ.get("APP_NAME", "ClosetAI")
resend.api_key = RESEND_API_KEY

LLM_MODEL_NAME = os.environ.get("OPENAI_MODEL", "gpt-4o")

_openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

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

# Built-in wardrobe categories. Users can add their own custom categories on top.
BUILT_IN_CATEGORIES = [
    {"id": "tops", "name": "Tops"},
    {"id": "bottoms", "name": "Bottoms"},
    {"id": "dresses", "name": "Dresses"},
    {"id": "outerwear", "name": "Outerwear"},
    {"id": "suits", "name": "Suits & Blazers"},
    {"id": "shoes", "name": "Shoes"},
    {"id": "bags", "name": "Bags"},
    {"id": "accessories", "name": "Accessories"},
    {"id": "hats", "name": "Hats"},
    {"id": "jewelry", "name": "Jewelry"},
    {"id": "watches", "name": "Watches"},
    {"id": "belts", "name": "Belts"},
    {"id": "scarves", "name": "Scarves"},
    {"id": "sunglasses", "name": "Sunglasses"},
    {"id": "activewear", "name": "Activewear"},
    {"id": "swimwear", "name": "Swimwear"},
    {"id": "sleepwear", "name": "Sleepwear"},
    {"id": "loungewear", "name": "Loungewear"},
    {"id": "underwear", "name": "Underwear"},
]
BUILT_IN_CATEGORY_IDS = {c["id"] for c in BUILT_IN_CATEGORIES}


def slugify(s: str) -> str:
    s = _re.sub(r"[^a-zA-Z0-9]+", "_", s.strip().lower())
    s = _re.sub(r"_+", "_", s).strip("_")
    return s[:40] or "category"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=60)
    birth_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    guardian_email: Optional[EmailStr] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    username: Optional[str] = None
    avatar: Optional[str] = None
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


CATEGORY_VALUES = ["tops", "bottoms", "outerwear", "shoes", "accessories", "dresses"]
PRIVACY_VALUES = ["public", "friends", "private"]


class WardrobeItemCreate(BaseModel):
    image_base64: str
    category: str = Field(min_length=1, max_length=40)
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
    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
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
    lat: Optional[float] = None
    lon: Optional[float] = None


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
    # Accept either an email, a username, or a user_id. At least one is required.
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    user_id: Optional[str] = None


class ContactMatchBody(BaseModel):
    emails: List[EmailStr] = []
    phone_hashes: List[str] = []  # client-side SHA-256 of normalized phone numbers


class FriendAccessUpdate(BaseModel):
    access_level: Literal["full", "limited", "none"]


class FriendItem(BaseModel):
    id: str  # friendship id
    friend_user_id: str
    friend_email: str
    friend_name: str
    friend_username: Optional[str] = None
    friend_avatar: Optional[str] = None
    access_level: str
    status: str  # pending | accepted | blocked
    direction: str  # incoming, outgoing, friends, blocked-by-me, blocked-by-them
    created_at: str


class MessageCreate(BaseModel):
    to_user_id: str
    text: str = ""
    recommended_item_id: Optional[str] = None  # if recommending an outfit item
    image_base64: Optional[str] = None  # for photo messages


class MessageItem(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    text: str
    image_base64: Optional[str] = None
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
        username=user.get("username"),
        avatar=user.get("avatar"),
        created_at=user["created_at"],
    )


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
async def _llm_complete(system_message: str, user_text: str) -> str:
    try:
        response = await asyncio.wait_for(
            _openai_client.chat.completions.create(
                model=LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_text},
                ],
            ),
            timeout=90,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except Exception as e:  # surface to client
        logger.exception("LLM error")
        raise HTTPException(status_code=502, detail=f"LLM error: {str(e)[:200]}")
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
MIN_AGE = 13


_USERNAME_PATTERN = _re.compile(r"[^a-z0-9_]+")


def _slugify_username(raw: str) -> str:
    base = (raw or "user").strip().lower().replace(" ", "_")
    base = _USERNAME_PATTERN.sub("", base) or "user"
    return base[:18]


async def _generate_username(name: str) -> str:
    base = _slugify_username(name)
    candidate = base
    for i in range(0, 10_000):
        if i:
            candidate = f"{base}{i}"
        existing = await db.users.find_one({"username": candidate})
        if not existing:
            return candidate
    # fallback unique
    return f"{base}_{uuid.uuid4().hex[:6]}"


async def _hash_phone(phone: str) -> str:
    """Normalize and hash a phone number for contact matching."""
    digits = _re.sub(r"[^0-9]", "", phone or "")
    if not digits:
        return ""
    # SHA-256 of last 10 digits (country-code-agnostic). Stable, irreversible.
    digits = digits[-10:] if len(digits) >= 10 else digits
    return hashlib.sha256(digits.encode("utf-8")).hexdigest()


@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(body: SignupBody):
    # Age gate (13+ with guardian email when under 18)
    age: Optional[int] = None
    if body.birth_year:
        try:
            from datetime import datetime as _dt
            age = _dt.utcnow().year - int(body.birth_year)
        except Exception:
            age = None
    if age is not None:
        if age < MIN_AGE:
            raise HTTPException(
                status_code=400,
                detail=f"Sorry — Closet AI requires users to be at least {MIN_AGE} years old.",
            )
        if age < 18 and not body.guardian_email:
            raise HTTPException(
                status_code=400,
                detail="Users under 18 need a parent or guardian's email for permission.",
            )

    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    username = await _generate_username(body.name)
    user = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "name": body.name.strip(),
        "username": username,
        "password_hash": hash_password(body.password),
        "avatar": None,
        "birth_year": body.birth_year,
        "guardian_email": body.guardian_email.lower() if body.guardian_email else None,
        "guardian_consent": "pending" if (age is not None and age < 18 and body.guardian_email) else None,
        "created_at": utc_now(),
    }
    await db.users.insert_one(user)
    logger.info(
        "auth.signup ok (user=%s, age=%s, guardian=%s)",
        user["id"], age, "yes" if user.get("guardian_email") else "no",
    )
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
    # ----- Image validation -----
    raw_b64 = body.image_base64 or ""
    if "," in raw_b64[:80]:
        # strip data-uri prefix if present
        raw_b64 = raw_b64.split(",", 1)[1]
    approx_bytes = (len(raw_b64) * 3) // 4
    MAX_BYTES = 6 * 1024 * 1024  # 6 MB after base64 → ~4.5 MB binary
    if approx_bytes <= 0:
        logger.warning("wardrobe.add rejected: empty image (user=%s)", user["id"])
        raise HTTPException(status_code=400, detail="Photo is empty.")
    if approx_bytes > MAX_BYTES:
        logger.warning(
            "wardrobe.add rejected: image too large (user=%s, bytes=%d, max=%d)",
            user["id"], approx_bytes, MAX_BYTES,
        )
        raise HTTPException(
            status_code=413,
            detail=f"Photo too large ({approx_bytes // 1024} KB). Try a smaller image.",
        )

    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "image_base64": raw_b64,
        "category": body.category,
        "name": body.name,
        "color": body.color,
        "rating": body.rating,
        "privacy": body.privacy,
        "tags": body.tags,
        "created_at": utc_now(),
    }
    try:
        await db.wardrobe.insert_one(item)
    except Exception as e:
        logger.exception("wardrobe.add insert failed (user=%s): %s", user["id"], e)
        raise HTTPException(status_code=500, detail="Could not save item right now.")
    logger.info(
        "wardrobe.add success (user=%s, cat=%s, bytes=%d)",
        user["id"], body.category, approx_bytes,
    )
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
    "You are Closet AI, a premium personal styling assistant.\n\n"
    "Communication Style:\n"
    "- Be concise and elegant.\n"
    "- Avoid emojis.\n"
    "- Avoid excessive formatting.\n"
    "- Do not use asterisks for emphasis.\n"
    "- Keep responses under 100 words unless the user requests detail.\n"
    "- Use short paragraphs instead of bullet points whenever possible.\n"
    "- Sound like a luxury retail stylist, not a chatbot.\n"
    "- Be confident and direct.\n"
    "- Give recommendations first, explanations second.\n"
    "- Never use phrases such as \"I'd be happy to help\", \"Great question\", or "
    "\"Let me know if you'd like more help\".\n"
    "- Avoid repeating the user's question.\n\n"
    "Decision engine — every recommendation must factor in (when available): "
    "the user's Style Avatar (height, weight, measurements, body shape, preferred fits, "
    "preferred brands, shoe size), Style Profile (which aesthetics they like), Color "
    "Profile (best colors, colors to avoid), current weather and location, season, "
    "upcoming travel and calendar events, occasion, and their wardrobe inventory with "
    "category and 1-5 self-rating. Prefer existing wardrobe items before suggesting "
    "purchases. When recommending wardrobe items, reference each piece by ID using "
    "the exact format ITEM:<id>. Prefer higher-rated items. If a key piece is missing, "
    "briefly suggest what they should buy and the recommended size based on their "
    "measurements."
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
    ctx = await _build_context_for_user(user, body.lat, body.lon)
    system_msg = _build_system_message(user, ctx)
    context_parts = []
    if body.weather:
        context_parts.append(f"User-stated weather override: {body.weather}")
    if body.occasion:
        context_parts.append(f"Occasion: {body.occasion}")
    context = "\n".join(context_parts)
    full_msg = f"{context}\n\nUser: {body.message}" if context else body.message
    reply_text = await _llm_complete(system_msg, full_msg)
    valid_ids = {it["id"] for it in (ctx["wardrobe"] or [])}
    rec_ids = _extract_item_ids(reply_text, valid_ids)
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
    raw = await _llm_complete(PRICE_SYSTEM_PROMPT, user_msg)
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
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
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
    msg = (
        f"Suggest an outfit for this event:\n"
        f"Title: {event['title']}\n"
        f"Date: {event['date']}\n"
        f"Location: {event.get('location') or 'n/a'}\n"
        f"Weather: {event.get('weather') or 'n/a'}\n"
        f"Description: {event.get('description') or 'n/a'}\n"
        f"List 2-4 specific items from the wardrobe by ITEM:<id> and explain in 2 sentences."
    )
    reply = await _llm_complete(system_msg, msg)
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
    if status_val == "blocked":
        blocker = doc.get("blocked_by")
        direction = "blocked-by-me" if blocker == current_user_id else "blocked-by-them"
    elif status_val == "accepted":
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
        friend_username=friend_user.get("username"),
        friend_avatar=friend_user.get("avatar"),
        access_level=doc.get("access_levels", {}).get(current_user_id, "limited"),
        status=status_val,
        direction=direction,
        created_at=doc["created_at"],
    )


@api_router.post("/friends/request", response_model=FriendItem)
async def send_friend_request(body: FriendRequestBody, user: dict = Depends(get_current_user)):
    target = None
    if body.user_id:
        target = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    elif body.username:
        target = await db.users.find_one({"username": body.username.lower().strip()}, {"_id": 0})
    elif body.email:
        target = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
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


# ---- Currency rates (Frankfurter / ECB, no API key) ----

CURRENCY_CACHE_TTL_SEC = 6 * 60 * 60  # 6 hours
_currency_cache: dict[str, dict] = {}  # in-process L1 cache; falls back to mongo L2

SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AUD", "CAD", "CHF", "SEK",
    "NZD", "MXN", "BRL", "ZAR", "SGD", "HKD", "KRW", "NOK", "DKK", "PLN",
    "TRY", "AED", "SAR", "THB", "IDR", "MYR", "PHP", "ILS", "HUF", "CZK", "RON",
]


async def _fetch_currency_rates(base: str) -> dict:
    """
    Returns {"base": base, "date": "YYYY-MM-DD", "rates": {"EUR": 0.92, ...}, "source": "frankfurter|fallback"}
    Cache hierarchy: in-process → mongo (24h) → live API. Always returns something usable.
    """
    base = (base or "USD").upper()
    now_ts = int(time.time())

    # L1 cache
    cached = _currency_cache.get(base)
    if cached and now_ts - cached.get("_fetched_at", 0) < CURRENCY_CACHE_TTL_SEC:
        return cached

    # L2 cache (mongo)
    db_doc = await db.currency_rates.find_one({"base": base}, {"_id": 0})
    if db_doc and now_ts - db_doc.get("_fetched_at", 0) < CURRENCY_CACHE_TTL_SEC:
        _currency_cache[base] = db_doc
        return db_doc

    # L3: live
    url = f"https://api.frankfurter.app/latest?from={base}"
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client_h:
            r = await client_h.get(url)
            r.raise_for_status()
            data = r.json()
        rates = data.get("rates") or {}
        rates[base] = 1.0  # self-rate, useful for clients
        doc = {
            "base": base,
            "date": data.get("date", ""),
            "rates": rates,
            "source": "frankfurter",
            "_fetched_at": now_ts,
        }
        # persist
        await db.currency_rates.update_one({"base": base}, {"$set": doc}, upsert=True)
        _currency_cache[base] = doc
        return doc
    except Exception as e:  # noqa: BLE001
        logger.warning("currency.fetch failed for base=%s: %s", base, e)
        # Fall back to whatever we have in db, even if stale.
        if db_doc:
            return db_doc
        # last-resort static fallback (approximate, identity for base)
        fallback_rates = {c: 1.0 for c in SUPPORTED_CURRENCIES}
        return {
            "base": base,
            "date": "",
            "rates": fallback_rates,
            "source": "fallback",
            "_fetched_at": now_ts,
        }


@api_router.get("/currency/rates")
async def currency_rates(base: str = "USD"):
    """Public: live FX rates with 6h server cache. No auth required."""
    base = (base or "USD").upper()
    if base not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported base currency. Try one of: {', '.join(SUPPORTED_CURRENCIES[:6])}…")
    doc = await _fetch_currency_rates(base)
    return {
        "base": doc["base"],
        "date": doc.get("date", ""),
        "rates": doc.get("rates", {}),
        "source": doc.get("source", "unknown"),
        "supported": SUPPORTED_CURRENCIES,
    }


# ---- Friend Discovery v2 ----

@api_router.get("/users/search")
async def search_users(q: str = "", user: dict = Depends(get_current_user)):
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    safe = _re.escape(q)
    cur = db.users.find(
        {
            "$and": [
                {"id": {"$ne": user["id"]}},
                {
                    "$or": [
                        {"username": {"$regex": f"^{safe}", "$options": "i"}},
                        {"name": {"$regex": safe, "$options": "i"}},
                    ]
                },
            ]
        },
        {"_id": 0, "id": 1, "name": 1, "username": 1, "avatar": 1, "email": 1},
    ).limit(20)
    docs = await cur.to_list(length=20)

    # Resolve current friendship status for each result so the UI can show the right CTA.
    if not docs:
        return []
    ids = [d["id"] for d in docs]
    fs = await db.friendships.find(
        {
            "user_ids": {"$in": ids},
            "user_ids_all": user["id"],
        } if False else {
            "user_ids": {"$all": [user["id"]]},
        },
        {"_id": 0},
    ).to_list(length=500)
    state: dict[str, dict] = {}
    for f in fs:
        other = next((u for u in f["user_ids"] if u != user["id"]), None)
        if other in ids:
            state[other] = {"friendship_id": f["id"], "status": f["status"], "direction":
                ("outgoing" if f.get("requester_id") == user["id"] else "incoming") if f["status"] == "pending"
                else f["status"]}
    out = []
    for d in docs:
        out.append({
            "id": d["id"],
            "name": d["name"],
            "username": d.get("username"),
            "email": d.get("email"),
            "avatar": d.get("avatar"),
            "friendship": state.get(d["id"]),
        })
    return out


@api_router.post("/contacts/match")
async def contacts_match(body: ContactMatchBody, user: dict = Depends(get_current_user)):
    """Given client-supplied emails + hashed phone numbers, return matching ClosetAI users."""
    emails = [e.lower() for e in body.emails][:500]
    hashes = list({h for h in body.phone_hashes if h})[:500]
    if not emails and not hashes:
        return []
    or_clauses = []
    if emails:
        or_clauses.append({"email": {"$in": emails}})
    if hashes:
        or_clauses.append({"phone_hash": {"$in": hashes}})
    docs = await db.users.find(
        {"$and": [{"id": {"$ne": user["id"]}}, {"$or": or_clauses}]},
        {"_id": 0, "id": 1, "name": 1, "username": 1, "avatar": 1, "email": 1},
    ).limit(200).to_list(length=200)
    return [
        {
            "id": d["id"],
            "name": d["name"],
            "username": d.get("username"),
            "avatar": d.get("avatar"),
            "matched_via": "email" if d["email"].lower() in emails else "phone",
        }
        for d in docs
    ]


class PhoneRegisterBody(BaseModel):
    phone_hash: str


@api_router.post("/users/phone")
async def set_phone_hash(body: PhoneRegisterBody, user: dict = Depends(get_current_user)):
    """Save the user's own hashed phone so future contact-match calls from friends can find them."""
    h = (body.phone_hash or "").strip().lower()
    if not h:
        raise HTTPException(status_code=400, detail="Empty hash")
    await db.users.update_one({"id": user["id"]}, {"$set": {"phone_hash": h}})
    return {"ok": True}


class UsernameUpdateBody(BaseModel):
    username: str = Field(min_length=3, max_length=18, pattern=r"^[a-z0-9_]+$")


@api_router.patch("/users/username", response_model=UserPublic)
async def update_username(body: UsernameUpdateBody, user: dict = Depends(get_current_user)):
    new = body.username.lower()
    existing = await db.users.find_one({"username": new, "id": {"$ne": user["id"]}})
    if existing:
        raise HTTPException(status_code=409, detail="That username is taken.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"username": new}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_public(fresh)


@api_router.post("/friends/{friendship_id}/block", response_model=FriendItem)
async def block_friend(friendship_id: str, user: dict = Depends(get_current_user)):
    doc = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not doc or user["id"] not in doc["user_ids"]:
        raise HTTPException(status_code=404, detail="Not found")
    await db.friendships.update_one(
        {"id": friendship_id},
        {"$set": {"status": "blocked", "blocked_by": user["id"]}},
    )
    other_id = next((u for u in doc["user_ids"] if u != user["id"]), None)
    other = await db.users.find_one({"id": other_id}, {"_id": 0}) if other_id else None
    updated = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    return _friendship_to_item(updated, user["id"], other or {"id": other_id, "email": "", "name": ""})


@api_router.post("/friends/{friendship_id}/unblock", response_model=FriendItem)
async def unblock_friend(friendship_id: str, user: dict = Depends(get_current_user)):
    doc = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not doc or user["id"] not in doc["user_ids"]:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("blocked_by") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the user who blocked can unblock.")
    # Delete the friendship row entirely so they can start fresh.
    await db.friendships.delete_one({"id": friendship_id})
    other_id = next((u for u in doc["user_ids"] if u != user["id"]), None)
    other = await db.users.find_one({"id": other_id}, {"_id": 0}) if other_id else None
    return _friendship_to_item(
        {**doc, "status": "removed"},
        user["id"],
        other or {"id": other_id or "", "email": "", "name": ""},
    )


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
    # Must be friends (not blocked).
    friendship = await db.friendships.find_one({
        "user_ids": {"$all": [user["id"], body.to_user_id]},
        "status": "accepted",
    }, {"_id": 0})
    if not friendship:
        raise HTTPException(status_code=403, detail="You can only message friends")
    if not (body.text and body.text.strip()) and not body.image_base64 and not body.recommended_item_id:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Validate image size if present (≤6 MB base64 ≈ 4.5 MB binary).
    img = body.image_base64 or None
    if img:
        if "," in img[:80]:
            img = img.split(",", 1)[1]
        if (len(img) * 3) // 4 > 6 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Photo too large. Try a smaller image.")

    snapshot = None
    if body.recommended_item_id:
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
        "text": body.text or "",
        "image_base64": img,
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
# Contacts lookup
# ---------------------------------------------------------------------------
class ContactLookupBody(BaseModel):
    emails: List[str]


@api_router.post("/users/lookup")
async def lookup_users_by_email(body: ContactLookupBody, user: dict = Depends(get_current_user)):
    """Given a list of emails, return users that exist on ClosetAI (excluding self)."""
    norm_emails = list({e.lower().strip() for e in body.emails if e})
    if not norm_emails:
        return []
    docs = await db.users.find(
        {"email": {"$in": norm_emails}, "id": {"$ne": user["id"]}},
        {"_id": 0, "password_hash": 0},
    ).to_list(500)
    # Mark which are already friends
    friendships = await db.friendships.find({"user_ids": user["id"]}, {"_id": 0}).to_list(1000)
    friend_state: dict[str, str] = {}
    for f in friendships:
        other = f["requester_id"] if f["addressee_id"] == user["id"] else f["addressee_id"]
        friend_state[other] = f["status"]
    out = []
    for d in docs:
        out.append({
            "id": d["id"],
            "name": d["name"],
            "email": d["email"],
            "avatar": d.get("avatar"),
            "friend_status": friend_state.get(d["id"]),  # None | pending | accepted
        })
    return out


# ---------------------------------------------------------------------------
# Reminders (laundry, prep clothes, etc.)
# ---------------------------------------------------------------------------
REMINDER_TYPES = ["laundry", "outfit_prep", "shopping", "other"]


class ReminderCreate(BaseModel):
    title: str
    type: Literal["laundry", "outfit_prep", "shopping", "other"] = "other"
    remind_at: str  # ISO datetime
    notes: Optional[str] = None
    event_id: Optional[str] = None
    notification_id: Optional[str] = None  # local notification id from client


class ReminderUpdate(BaseModel):
    done: Optional[bool] = None
    notification_id: Optional[str] = None


class ReminderItem(BaseModel):
    id: str
    user_id: str
    title: str
    type: str
    remind_at: str
    notes: Optional[str] = None
    event_id: Optional[str] = None
    notification_id: Optional[str] = None
    done: bool = False
    created_at: str


def _reminder_doc_to_model(d: dict) -> ReminderItem:
    return ReminderItem(**{k: d.get(k) for k in ReminderItem.model_fields.keys()})


@api_router.post("/reminders", response_model=ReminderItem)
async def create_reminder(body: ReminderCreate, user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": body.title,
        "type": body.type,
        "remind_at": body.remind_at,
        "notes": body.notes,
        "event_id": body.event_id,
        "notification_id": body.notification_id,
        "done": False,
        "created_at": utc_now(),
    }
    await db.reminders.insert_one(item)
    return _reminder_doc_to_model(item)


@api_router.get("/reminders", response_model=List[ReminderItem])
async def list_reminders(user: dict = Depends(get_current_user)):
    docs = await db.reminders.find({"user_id": user["id"]}, {"_id": 0}).sort("remind_at", 1).to_list(500)
    return [_reminder_doc_to_model(d) for d in docs]


@api_router.patch("/reminders/{rid}", response_model=ReminderItem)
async def update_reminder(rid: str, body: ReminderUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        doc = await db.reminders.find_one({"id": rid, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Reminder not found")
        return _reminder_doc_to_model(doc)
    res = await db.reminders.find_one_and_update(
        {"id": rid, "user_id": user["id"]},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return _reminder_doc_to_model(res)


@api_router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user: dict = Depends(get_current_user)):
    res = await db.reminders.delete_one({"id": rid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Style Avatar / Fit Profile
# ---------------------------------------------------------------------------
STYLE_OPTIONS = [
    "classic", "luxury", "smart_casual", "business", "minimalist",
    "streetwear", "athleisure", "contemporary", "trend_driven",
]


class StyleProfileUpdate(BaseModel):
    height_cm: Optional[float] = Field(default=None, ge=80, le=260)
    weight_kg: Optional[float] = Field(default=None, ge=25, le=300)
    age_range: Optional[str] = None
    gender: Optional[str] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    neck_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    sleeve_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    shoe_size: Optional[str] = None
    body_shape: Optional[str] = None
    styles: Optional[List[str]] = None
    skin_tone: Optional[str] = None
    hair_color: Optional[str] = None
    eye_color: Optional[str] = None
    best_colors: Optional[List[str]] = None
    avoid_colors: Optional[List[str]] = None
    preferred_brands: Optional[List[str]] = None
    preferred_fits: Optional[List[str]] = None
    avatar_b64: Optional[str] = None
    home_lat: Optional[float] = None
    home_lon: Optional[float] = None
    home_label: Optional[str] = None
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    onboarded: Optional[bool] = None


class StyleProfile(BaseModel):
    user_id: str
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    neck_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    sleeve_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    shoe_size: Optional[str] = None
    body_shape: Optional[str] = None
    styles: List[str] = []
    skin_tone: Optional[str] = None
    hair_color: Optional[str] = None
    eye_color: Optional[str] = None
    best_colors: List[str] = []
    avoid_colors: List[str] = []
    preferred_brands: List[str] = []
    preferred_fits: List[str] = []
    avatar_b64: Optional[str] = None
    home_lat: Optional[float] = None
    home_lon: Optional[float] = None
    home_label: Optional[str] = None
    currency: str = "USD"
    onboarded: bool = False
    created_at: str
    updated_at: str


async def _get_or_create_profile(user_id: str) -> dict:
    doc = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return doc
    doc = {
        "user_id": user_id,
        "styles": [],
        "best_colors": [],
        "avoid_colors": [],
        "preferred_brands": [],
        "preferred_fits": [],
        "onboarded": False,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    await db.profiles.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.get("/profile", response_model=StyleProfile)
async def get_profile(user: dict = Depends(get_current_user)):
    doc = await _get_or_create_profile(user["id"])
    return StyleProfile(**{k: doc[k] for k in StyleProfile.model_fields.keys() if k in doc and doc[k] is not None})


@api_router.patch("/profile", response_model=StyleProfile)
async def update_profile(body: StyleProfileUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = utc_now()
    if "styles" in update:
        update["styles"] = [s for s in update["styles"] if isinstance(s, str)]
    await _get_or_create_profile(user["id"])
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": update})
    doc = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return StyleProfile(**{k: doc[k] for k in StyleProfile.model_fields.keys() if k in doc and doc[k] is not None})


# ---------------------------------------------------------------------------
# Weather (Open-Meteo, free, no key)
# ---------------------------------------------------------------------------
def _wmo_to_condition(code: int) -> str:
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "mostly clear"
    if code == 3:
        return "overcast"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 56, 57):
        return "drizzle"
    if code in (61, 63, 65, 66, 67):
        return "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (80, 81, 82):
        return "showers"
    if code in (95, 96, 99):
        return "thunderstorm"
    return "unknown"


@api_router.get("/weather")
async def weather(lat: float, lon: float, user: dict = Depends(get_current_user)):
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
        "weather_code,wind_speed_10m,precipitation,uv_index"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
        "&forecast_days=3&timezone=auto"
    )
    geocode_url = (
        f"https://geocoding-api.open-meteo.com/v1/reverse?latitude={lat}&longitude={lon}&language=en&count=1"
    )
    async with httpx.AsyncClient(timeout=10) as client_h:
        try:
            r = await client_h.get(url)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Weather lookup failed: {e}")
        place = None
        try:
            gr = await client_h.get(geocode_url)
            if gr.status_code == 200:
                results = gr.json().get("results") or []
                if results:
                    p = results[0]
                    place = ", ".join([x for x in [p.get("name"), p.get("admin1"), p.get("country")] if x])
        except Exception:
            pass

    cur = data.get("current", {})
    daily = data.get("daily", {})
    code = int(cur.get("weather_code") or 0)
    out = {
        "place": place,
        "lat": lat,
        "lon": lon,
        "temp_c": cur.get("temperature_2m"),
        "feels_like_c": cur.get("apparent_temperature"),
        "humidity": cur.get("relative_humidity_2m"),
        "wind_kph": cur.get("wind_speed_10m"),
        "precip_mm": cur.get("precipitation"),
        "uv_index": cur.get("uv_index"),
        "condition": _wmo_to_condition(code),
        "weather_code": code,
        "summary": f"{round(cur.get('temperature_2m', 0))}°C, {_wmo_to_condition(code)}",
        "forecast": [
            {
                "date": d,
                "temp_min_c": tn,
                "temp_max_c": tx,
                "precip_chance": pc,
                "condition": _wmo_to_condition(int(wc or 0)),
            }
            for d, tn, tx, pc, wc in zip(
                daily.get("time", []),
                daily.get("temperature_2m_min", []),
                daily.get("temperature_2m_max", []),
                daily.get("precipitation_probability_max", []),
                daily.get("weather_code", []),
            )
        ],
    }
    return out


# ---------------------------------------------------------------------------
# Outfit generator + Build around this item
# ---------------------------------------------------------------------------
OCCASION_OPTIONS = [
    "work", "weekend", "date_night", "travel", "wedding",
    "casual", "formal", "hot_weather", "cold_weather",
]


class OutfitGenBody(BaseModel):
    occasion: str
    notes: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class BuildAroundBody(BaseModel):
    notes: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


def _season_now() -> str:
    m = datetime.now(timezone.utc).month
    if m in (12, 1, 2):
        return "winter"
    if m in (3, 4, 5):
        return "spring"
    if m in (6, 7, 8):
        return "summer"
    return "autumn"


def _format_profile_for_prompt(p: dict) -> str:
    if not p:
        return "(no Style Avatar set)"
    parts = []
    body = []
    for k, label in [
        ("height_cm", "height cm"),
        ("weight_kg", "weight kg"),
        ("chest_cm", "chest cm"),
        ("waist_cm", "waist cm"),
        ("hips_cm", "hips cm"),
        ("shoulder_cm", "shoulder cm"),
        ("inseam_cm", "inseam cm"),
        ("shoe_size", "shoe size"),
        ("body_shape", "body shape"),
    ]:
        if p.get(k):
            body.append(f"{label}={p[k]}")
    if body:
        parts.append("Body: " + ", ".join(body))
    if p.get("styles"):
        parts.append("Style: " + ", ".join(p["styles"]))
    if p.get("best_colors"):
        parts.append("Best colors: " + ", ".join(p["best_colors"]))
    if p.get("avoid_colors"):
        parts.append("Avoid colors: " + ", ".join(p["avoid_colors"]))
    if p.get("preferred_brands"):
        parts.append("Preferred brands: " + ", ".join(p["preferred_brands"]))
    if p.get("preferred_fits"):
        parts.append("Preferred fits: " + ", ".join(p["preferred_fits"]))
    return "\n".join(parts) if parts else "(no Style Avatar set)"


async def _build_context_for_user(user: dict, lat: Optional[float] = None, lon: Optional[float] = None) -> dict:
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    wardrobe = await db.wardrobe.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    now = datetime.now(timezone.utc)
    upcoming = await db.events.find(
        {"user_id": user["id"], "date": {"$gte": now.isoformat()}},
        {"_id": 0},
    ).sort("date", 1).to_list(5)
    weather_data = None
    use_lat = lat if lat is not None else profile.get("home_lat")
    use_lon = lon if lon is not None else profile.get("home_lon")
    if use_lat is not None and use_lon is not None:
        try:
            async with httpx.AsyncClient(timeout=8) as client_h:
                wurl = (
                    f"https://api.open-meteo.com/v1/forecast?latitude={use_lat}&longitude={use_lon}"
                    "&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m"
                    "&timezone=auto"
                )
                wr = await client_h.get(wurl)
                if wr.status_code == 200:
                    d = wr.json().get("current", {})
                    weather_data = {
                        "temp_c": d.get("temperature_2m"),
                        "feels_like_c": d.get("apparent_temperature"),
                        "wind_kph": d.get("wind_speed_10m"),
                        "precip_mm": d.get("precipitation"),
                        "condition": _wmo_to_condition(int(d.get("weather_code") or 0)),
                    }
        except Exception:
            pass
    return {"profile": profile, "wardrobe": wardrobe, "upcoming": upcoming, "weather": weather_data}


def _build_system_message(user: dict, ctx: dict, extra: str = "") -> str:
    profile_text = _format_profile_for_prompt(ctx.get("profile") or {})
    wardrobe_text = _format_wardrobe_for_prompt(ctx.get("wardrobe") or [])
    season = _season_now()
    weather = ctx.get("weather")
    upcoming = ctx.get("upcoming") or []
    weather_str = "(unknown)"
    if weather:
        weather_str = (
            f"{weather.get('temp_c')}°C feels like {weather.get('feels_like_c')}°C, "
            f"{weather.get('condition')}, wind {weather.get('wind_kph')} km/h, "
            f"precip {weather.get('precip_mm')} mm"
        )
    events_str = "\n".join(
        f"- {e['title']} on {e['date'][:10]} ({e.get('location') or 'no location'})" for e in upcoming
    ) or "(none scheduled)"
    sys = (
        f"{OUTFIT_SYSTEM_PROMPT}\n\n"
        f"USER: {user.get('name', '')}\n"
        f"SEASON: {season}\n"
        f"WEATHER: {weather_str}\n"
        f"STYLE AVATAR:\n{profile_text}\n\n"
        f"UPCOMING EVENTS:\n{events_str}\n\n"
        f"WARDROBE:\n{wardrobe_text}\n"
    )
    if extra:
        sys += f"\n{extra}"
    return sys


def _extract_item_ids(reply: str, valid: set[str]) -> List[str]:
    ids = list({m for m in _re.findall(r"ITEM:([0-9a-fA-F-]{36})", reply)})
    return [i for i in ids if i in valid]


@api_router.post("/outfit/generator", response_model=OutfitChatResponse)
async def outfit_generator(body: OutfitGenBody, user: dict = Depends(get_current_user)):
    ctx = await _build_context_for_user(user, body.lat, body.lon)
    session_id = f"gen-{user['id']}-{body.occasion}-{uuid.uuid4()}"
    pretty_occasion = body.occasion.replace("_", " ")
    sys = _build_system_message(user, ctx)
    msg = (
        f"Compose one complete outfit for: {pretty_occasion}.\n"
        f"Use 3-5 pieces from the wardrobe. Reference each by ITEM:<id>. "
        f"Add a single elegant sentence on why it works."
    )
    if body.notes:
        msg += f"\nNotes: {body.notes}"
    reply = await _llm_complete(sys, msg)
    valid = {it["id"] for it in (ctx["wardrobe"] or [])}
    rec_ids = _extract_item_ids(reply, valid)
    return OutfitChatResponse(reply=reply, session_id=session_id, recommended_item_ids=rec_ids)


@api_router.post("/outfit/build-around/{item_id}")
async def build_around_item(item_id: str, body: BuildAroundBody, user: dict = Depends(get_current_user)):
    item = await db.wardrobe.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    ctx = await _build_context_for_user(user, body.lat, body.lon)
    sys = _build_system_message(
        user,
        ctx,
        extra=f"BUILD-AROUND ANCHOR ITEM: ITEM:{item['id']} ({item.get('category')}, {item.get('name') or 'unnamed'}, {item.get('color') or 'unknown color'}).",
    )
    session_id = f"build-{item_id}-{uuid.uuid4()}"
    msg = (
        f"Generate 5 different complete outfits that all build around the anchor item above. "
        f"For each outfit, list 3-5 wardrobe pieces by ITEM:<id> and add a one-line stylist note. "
        f"Format as: Look 1: ... \\n Look 2: ... etc."
    )
    if body.notes:
        msg += f"\nNotes: {body.notes}"
    reply = await _llm_complete(sys, msg)
    valid = {it["id"] for it in (ctx["wardrobe"] or [])}
    rec_ids = _extract_item_ids(reply, valid)
    return {"reply": reply, "session_id": session_id, "anchor_item_id": item_id, "recommended_item_ids": rec_ids}


# ---------------------------------------------------------------------------
# Wardrobe categories (built-in + per-user custom)
# ---------------------------------------------------------------------------
class CategoryItem(BaseModel):
    id: str
    name: str
    built_in: bool = False


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


@api_router.get("/categories", response_model=List[CategoryItem])
async def list_categories(user: dict = Depends(get_current_user)):
    out: List[CategoryItem] = [CategoryItem(id=c["id"], name=c["name"], built_in=True) for c in BUILT_IN_CATEGORIES]
    user_docs = await db.user_categories.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    for d in user_docs:
        out.append(CategoryItem(id=d["id"], name=d["name"], built_in=False))
    return out


@api_router.post("/categories", response_model=CategoryItem)
async def add_category(body: CategoryCreate, user: dict = Depends(get_current_user)):
    cid = slugify(body.name)
    if cid in BUILT_IN_CATEGORY_IDS:
        raise HTTPException(status_code=409, detail="Category already exists as built-in")
    existing = await db.user_categories.find_one({"user_id": user["id"], "id": cid}, {"_id": 0})
    if existing:
        return CategoryItem(id=existing["id"], name=existing["name"], built_in=False)
    doc = {
        "id": cid,
        "user_id": user["id"],
        "name": body.name.strip(),
        "created_at": utc_now(),
    }
    await db.user_categories.insert_one(doc)
    return CategoryItem(id=cid, name=doc["name"], built_in=False)


@api_router.delete("/categories/{cid}")
async def delete_category(cid: str, user: dict = Depends(get_current_user)):
    if cid in BUILT_IN_CATEGORY_IDS:
        raise HTTPException(status_code=400, detail="Cannot remove a built-in category")
    res = await db.user_categories.delete_one({"id": cid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Password reset (Resend OTP flow)
# ---------------------------------------------------------------------------
OTP_TTL_MINUTES = 15
OTP_RESEND_COOLDOWN_SECONDS = 45


class ForgotBody(BaseModel):
    email: EmailStr


class VerifyOtpBody(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResetPasswordBody(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6)


def _hash_otp(otp: str) -> str:
    return hashlib.sha256((JWT_SECRET + ":" + otp).encode("utf-8")).hexdigest()


def _otp_email_html(name: str, otp: str) -> str:
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF9F6;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:0 auto;padding:48px 32px;background:#FFFFFF;">
    <div style="font-size:11px;letter-spacing:2px;color:#6A1E2F;font-weight:700;text-transform:uppercase;">{APP_NAME}</div>
    <h1 style="font-family:Georgia,serif;font-size:34px;font-weight:700;color:#1A1A1A;margin:8px 0 6px;letter-spacing:-1px;">
      Reset your password.
    </h1>
    <p style="font-family:Helvetica,Arial,sans-serif;color:#6B655E;font-size:15px;line-height:22px;">
      Hi {name or 'there'}, use the code below to set a new password. The code expires in {OTP_TTL_MINUTES} minutes.
    </p>
    <div style="margin:32px 0;padding:24px;background:#F5F2EA;text-align:center;border-radius:12px;">
      <div style="font-family:Georgia,serif;font-size:38px;font-weight:700;letter-spacing:12px;color:#6A1E2F;">
        {otp}
      </div>
    </div>
    <p style="font-family:Helvetica,Arial,sans-serif;color:#9C958C;font-size:12px;line-height:18px;">
      If you didn't request this, you can safely ignore this email — your password will remain unchanged.
    </p>
    <p style="font-family:Helvetica,Arial,sans-serif;color:#9C958C;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:32px;">
      {APP_NAME} · Your wardrobe, smarter.
    </p>
  </div>
</body></html>"""


async def _send_otp_email(email: str, name: str, otp: str) -> bool:
    """Send OTP via Resend. Returns True on success, False on failure."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — OTP for %s is %s", email, otp)
        return False
    try:
        params = {
            "from": RESEND_FROM,
            "to": [email],
            "subject": f"{APP_NAME}: Your password reset code",
            "html": _otp_email_html(name, otp),
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: resend.Emails.send(params))
        return True
    except Exception as e:
        logger.exception("Resend send failed: %s", e)
        return False


@api_router.post("/auth/forgot")
async def forgot_password(body: ForgotBody):
    """Always returns 200 to avoid email enumeration. Sends OTP only if email is registered."""
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        # Throttle: don't allow more than one OTP per cooldown window per user.
        recent = await db.password_resets.find_one(
            {"user_id": user["id"], "status": "pending"},
            sort=[("created_at", -1)],
            projection={"_id": 0},
        )
        now = datetime.now(timezone.utc)
        if recent:
            try:
                last = datetime.fromisoformat(recent["created_at"])
                if (now - last).total_seconds() < OTP_RESEND_COOLDOWN_SECONDS:
                    return {"ok": True, "cooldown_seconds": int(OTP_RESEND_COOLDOWN_SECONDS - (now - last).total_seconds())}
            except Exception:
                pass

        # Invalidate previous pending OTPs for this user
        await db.password_resets.update_many(
            {"user_id": user["id"], "status": "pending"},
            {"$set": {"status": "superseded"}},
        )
        otp = f"{secrets.randbelow(1_000_000):06d}"
        expires = now + timedelta(minutes=OTP_TTL_MINUTES)
        await db.password_resets.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "email": email,
            "otp_hash": _hash_otp(otp),
            "status": "pending",
            "attempts": 0,
            "expires_at": expires.isoformat(),
            "created_at": now.isoformat(),
        })
        sent = await _send_otp_email(email, user.get("name") or "", otp)
        if not sent:
            logger.info("OTP for %s (dev fallback): %s", email, otp)
    return {"ok": True}


@api_router.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    email = body.email.lower()
    if not body.otp.isdigit():
        raise HTTPException(status_code=400, detail="Invalid code")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code")
    rec = await db.password_resets.find_one(
        {"user_id": user["id"], "status": "pending"},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid code")
    try:
        expires = datetime.fromisoformat(rec["expires_at"])
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        await db.password_resets.update_one({"id": rec["id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")
    if rec.get("attempts", 0) >= 5:
        await db.password_resets.update_one({"id": rec["id"]}, {"$set": {"status": "locked"}})
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    if not hmac.compare_digest(rec["otp_hash"], _hash_otp(body.otp)):
        await db.password_resets.update_one({"id": rec["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid code")

    # OTP valid → mark verified, issue short-lived reset token
    await db.password_resets.update_one({"id": rec["id"]}, {"$set": {"status": "verified"}})
    payload = {
        "sub": user["id"],
        "purpose": "password_reset",
        "rid": rec["id"],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"reset_token": token}


@api_router.post("/auth/reset")
async def reset_password(body: ResetPasswordBody):
    try:
        payload = jwt.decode(body.reset_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token")
    user_id = payload.get("sub")
    rid = payload.get("rid")
    rec = await db.password_resets.find_one({"id": rid, "user_id": user_id}, {"_id": 0})
    if not rec or rec.get("status") != "verified":
        raise HTTPException(status_code=400, detail="Reset token already used or invalid")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    new_hash = hash_password(body.new_password)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": new_hash}})
    await db.password_resets.update_one({"id": rid}, {"$set": {"status": "used"}})
    # Invalidate any other pending resets
    await db.password_resets.update_many(
        {"user_id": user_id, "status": "pending"}, {"$set": {"status": "superseded"}}
    )
    return {"ok": True}


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


@app.on_event("startup")
async def startup_db_indexes():
    """Performance + lookup indexes. Idempotent — safe on every reload."""
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("username", unique=True, sparse=True)
        await db.users.create_index("phone_hash", sparse=True)
        await db.wardrobe.create_index([("user_id", 1), ("created_at", -1)])
        await db.wardrobe.create_index([("user_id", 1), ("category", 1)])
        await db.messages.create_index([("from_user_id", 1), ("to_user_id", 1), ("created_at", 1)])
        await db.messages.create_index([("to_user_id", 1), ("created_at", -1)])
        await db.friendships.create_index("user_ids")
        await db.friendships.create_index([("user_ids", 1), ("status", 1)])
        await db.wishlist.create_index([("user_id", 1), ("created_at", -1)])
        await db.events.create_index([("user_id", 1), ("date", 1)])
        await db.reminders.create_index([("user_id", 1), ("remind_at", 1)])
        logger.info("startup: indexes ensured")
    except Exception as e:  # noqa: BLE001
        logger.warning("startup: index creation issue: %s", e)

    # Backfill missing usernames for legacy users so search works for everyone.
    try:
        cursor = db.users.find({"$or": [{"username": {"$exists": False}}, {"username": None}]}, {"_id": 0, "id": 1, "name": 1})
        async for u in cursor:
            uname = await _generate_username(u.get("name") or "user")
            await db.users.update_one({"id": u["id"]}, {"$set": {"username": uname}})
        logger.info("startup: legacy usernames backfilled")
    except Exception as e:  # noqa: BLE001
        logger.warning("startup: username backfill issue: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
