// Shared currency hook. Keeps the user's preferred currency in sync between
// AsyncStorage (offline) and the server (StyleProfile.currency).

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

export function useCurrency() {
  const [code, setCode] = useState<string>("USD");
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
    return () => {
      alive = false;
    };
  }, []);

  const setCurrency = useCallback(async (next: string) => {
    setCode(next);
    await saveCurrency(next);
    try {
      await api.updateProfile({ currency: next });
    } catch (e) {
      // non-fatal; local pref still applies
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
