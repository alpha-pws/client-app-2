import os
import io
import base64
import random
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")


def _make_real_image_b64(seed: int = 1) -> str:
    """Generate a small JPEG with real features (shapes + noise)."""
    random.seed(seed)
    img = Image.new("RGB", (128, 128), (240, 240, 240))
    draw = ImageDraw.Draw(img)
    # Add some shapes
    draw.rectangle([10, 10, 60, 60], fill=(random.randint(50, 200), 50, 80))
    draw.ellipse([60, 60, 120, 120], fill=(40, random.randint(80, 200), 120))
    draw.line([0, 0, 128, 128], fill=(0, 0, 0), width=3)
    # Add pixel noise for texture
    px = img.load()
    for _ in range(500):
        x = random.randint(0, 127)
        y = random.randint(0, 127)
        px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def real_image_b64():
    return _make_real_image_b64(1)


@pytest.fixture(scope="session")
def real_image_b64_2():
    return _make_real_image_b64(7)
