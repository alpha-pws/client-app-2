"""Tests for global currency conversion feature."""
import os
import time
import pytest
import requests

_url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not _url:
    # fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    _url = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
if not _url:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
BASE_URL = _url.rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "test@closetai.com", "password": "test1234"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


# --- 1. Public rates endpoint ---

class TestCurrencyRates:
    def test_rates_usd_default(self, session):
        r = session.get(f"{BASE_URL}/api/currency/rates")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["base"] == "USD"
        assert "date" in data and len(data["date"]) == 10  # YYYY-MM-DD
        assert "rates" in data and isinstance(data["rates"], dict)
        # Sanity: EUR/GBP/INR exist
        for code in ("EUR", "GBP", "INR"):
            assert code in data["rates"], f"missing {code}"
        # EUR rate sanity
        assert 0.5 < data["rates"]["EUR"] < 2.0
        # Source should be frankfurter (live), not fallback
        assert data.get("source") == "frankfurter", f"source={data.get('source')}"
        # Supported list with ~30 codes
        assert "supported" in data
        assert isinstance(data["supported"], list)
        assert len(data["supported"]) >= 30

    def test_rates_with_base_eur(self, session):
        r_usd = session.get(f"{BASE_URL}/api/currency/rates?base=USD")
        r_eur = session.get(f"{BASE_URL}/api/currency/rates?base=EUR")
        assert r_eur.status_code == 200, r_eur.text
        eur_data = r_eur.json()
        assert eur_data["base"] == "EUR"
        assert "USD" in eur_data["rates"]
        usd_to_eur = r_usd.json()["rates"]["EUR"]
        eur_to_usd = eur_data["rates"]["USD"]
        # Reciprocal within 5%
        reciprocal = 1.0 / usd_to_eur
        diff_pct = abs(reciprocal - eur_to_usd) / reciprocal
        assert diff_pct < 0.05, f"USD/EUR not reciprocal: {usd_to_eur} vs {eur_to_usd}"

    def test_rates_invalid_base(self, session):
        r = session.get(f"{BASE_URL}/api/currency/rates?base=ZZZ")
        assert r.status_code == 400, r.text
        assert "unsupported" in r.json()["detail"].lower()


# --- 2. Profile currency persistence ---

class TestProfileCurrency:
    def test_patch_profile_currency_inr(self, session, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        # set to INR
        r = session.patch(
            f"{BASE_URL}/api/profile",
            json={"currency": "INR"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        # verify via GET
        g = session.get(f"{BASE_URL}/api/profile", headers=headers)
        assert g.status_code == 200, g.text
        assert g.json().get("currency") == "INR"

    def test_patch_profile_currency_invalid_short(self, session, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        r = session.patch(
            f"{BASE_URL}/api/profile",
            json={"currency": "X"},
            headers=headers,
        )
        assert r.status_code == 422, r.text

    def test_reset_profile_currency_to_usd(self, session, auth_token):
        """Cleanup: leave the test user with USD so other tests are deterministic."""
        headers = {"Authorization": f"Bearer {auth_token}"}
        r = session.patch(
            f"{BASE_URL}/api/profile",
            json={"currency": "USD"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        g = session.get(f"{BASE_URL}/api/profile", headers=headers)
        assert g.json().get("currency") == "USD"
