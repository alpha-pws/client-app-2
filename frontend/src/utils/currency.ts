// Global currency utilities for ClosetAI.
//
// - Fetches rates from /api/currency/rates (frankfurter / ECB, cached 6h server-side)
// - Caches in AsyncStorage for 24h offline support
// - Auto-detects a sensible default from the device locale
// - Provides format() and convert() helpers shared across screens

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/src/api";

const CACHE_KEY = "@closetai/currency_rates_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SELECTED_KEY = "@closetai/currency_selected_v1";

export type RatesPacket = {
  base: string;
  date: string;
  rates: Record<string, number>;
  source: string;
  supported?: string[];
  _fetchedAt?: number;
};

export const CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
];

const CODES = new Set(CURRENCIES.map((c) => c.code));

/** Best-effort guess based on browser/device locale. Returns a 3-letter code. */
export function detectDefaultCurrency(): string {
  try {
    // Intl.NumberFormat resolvedOptions().currency is set on iOS/Android RN since 13/77.
    const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
    const opts = fmt.resolvedOptions() as Intl.ResolvedNumberFormatOptions & {
      currency?: string;
    };
    const guess = opts.currency?.toUpperCase();
    if (guess && CODES.has(guess)) return guess;
  } catch {}
  // Fallback: derive from locale region.
  try {
    const loc = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale : "en-US";
    const region = (loc.split("-")[1] || "US").toUpperCase();
    const REGION_TO_CCY: Record<string, string> = {
      US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", PT: "EUR", NL: "EUR", IE: "EUR",
      AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR", IN: "INR", CN: "CNY", JP: "JPY", AU: "AUD", CA: "CAD",
      CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", BR: "BRL", MX: "MXN", ZA: "ZAR",
      SG: "SGD", HK: "HKD", KR: "KRW", TR: "TRY", AE: "AED", SA: "SAR", TH: "THB", ID: "IDR",
      MY: "MYR", PH: "PHP", IL: "ILS", HU: "HUF", CZ: "CZK", RO: "RON", NZ: "NZD",
    };
    return REGION_TO_CCY[region] || "USD";
  } catch {
    return "USD";
  }
}

let _ratesCache: RatesPacket | null = null;

export async function loadRates(base: string = "USD"): Promise<RatesPacket> {
  // L1 in-memory
  if (_ratesCache && _ratesCache.base === base && _ratesCache._fetchedAt && Date.now() - _ratesCache._fetchedAt < CACHE_TTL_MS) {
    return _ratesCache;
  }
  // L2 disk
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY}::${base}`);
    if (raw) {
      const cached = JSON.parse(raw) as RatesPacket;
      if (cached._fetchedAt && Date.now() - cached._fetchedAt < CACHE_TTL_MS) {
        _ratesCache = cached;
        return cached;
      }
    }
  } catch {}
  // L3 network
  try {
    const fresh = await api.getCurrencyRates(base);
    const packet: RatesPacket = { ...fresh, _fetchedAt: Date.now() };
    _ratesCache = packet;
    AsyncStorage.setItem(`${CACHE_KEY}::${base}`, JSON.stringify(packet)).catch(() => {});
    return packet;
  } catch (e) {
    // last resort: identity
    return {
      base,
      date: "",
      rates: Object.fromEntries(CURRENCIES.map((c) => [c.code, 1])),
      source: "identity",
    };
  }
}

/** Convert an amount from one currency to another using the latest cached packet. */
export function convert(amount: number, from: string, to: string, packet: RatesPacket): number {
  if (!isFinite(amount)) return amount;
  if (from === to) return amount;
  const rates = packet.rates || {};
  // Packet rates are in packet.base → target. Convert from→base, then base→to.
  const base = packet.base;
  let inBase = amount;
  if (from !== base) {
    const fromRate = rates[from];
    if (!fromRate) return amount; // unknown → no-op
    inBase = amount / fromRate;
  }
  if (to === base) return inBase;
  const toRate = rates[to];
  if (!toRate) return inBase;
  return inBase * toRate;
}

export function symbolOf(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol || code + " ";
}

/** Returns "$ 49.99" or "₹ 4,210" with locale-aware grouping. */
export function format(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    const sym = symbolOf(code);
    const sep = sym.length > 2 ? " " : "";
    return `${sym}${sep}${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

/** Convenience persistence helpers for the user's selected currency. */
export async function getSavedCurrency(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}
export async function saveCurrency(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SELECTED_KEY, code);
  } catch {}
}
