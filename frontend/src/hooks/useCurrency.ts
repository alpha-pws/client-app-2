// Shared currency hook. Keeps the user's preferred currency in sync between
// AsyncStorage (offline) and the server (StyleProfile.currency).
//
// All instances of this hook stay in sync via a tiny module-level emitter so
// changing the currency in Profile → Account also immediately updates the
// Wishlist tab without needing a screen reload.

import { useCallback, useEffect, useState } from "react";
import {
  CURRENCIES,
  RatesPacket,
  convert as convertFn,
  detectDefaultCurrency,
  format as formatFn,
  getSavedCurrency,
  loadRates,
  saveCurrency,
} from "@/src/utils/currency";
import { api } from "@/src/api";

// --- module-level singleton emitter ---
type Listener = (code: string) => void;
const _listeners = new Set<Listener>();
let _currentCode = "USD";

function _notify(next: string) {
  _currentCode = next;
  _listeners.forEach((l) => {
    try {
      l(next);
    } catch {}
  });
}

export function useCurrency() {
  const [code, setCode] = useState<string>(_currentCode);
  const [rates, setRates] = useState<RatesPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Resolve initial currency: server profile > local storage > device default.
  useEffect(() => {
    let alive = true;
    (async () => {
      let resolved: string | null = null;
      try {
        const profile = await api.getProfile();
        if (profile?.currency) resolved = profile.currency;
      } catch {}
      if (!resolved) resolved = await getSavedCurrency();
      if (!resolved) resolved = detectDefaultCurrency();
      if (!alive) return;
      setCode(resolved);
      _currentCode = resolved;
      await saveCurrency(resolved);
      try {
        const r = await loadRates("USD");
        if (alive) setRates(r);
      } finally {
        if (alive) {
          setLoading(false);
          setReady(true);
        }
      }
    })();
    // subscribe to global changes
    const handler: Listener = (next) => setCode(next);
    _listeners.add(handler);
    return () => {
      alive = false;
      _listeners.delete(handler);
    };
  }, []);

  const setCurrency = useCallback(async (next: string) => {
    setCode(next);
    _notify(next);
    await saveCurrency(next);
    try {
      await api.updateProfile({ currency: next });
    } catch (e) {
      console.warn("[currency] failed to persist on server", e);
    }
  }, []);

  const convert = useCallback(
    (amount: number, from: string = "USD") => {
      if (!rates) return amount;
      return convertFn(amount, from, code, rates);
    },
    [code, rates],
  );

  const formatPrice = useCallback(
    (amount: number, from: string = "USD") => {
      const v = convert(amount, from);
      return formatFn(v, code);
    },
    [code, convert],
  );

  return { code, setCurrency, rates, convert, formatPrice, loading, ready, CURRENCIES };
}
