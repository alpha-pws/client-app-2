// Helpers to deep-link a wishlist product URL with the user's preferred size
// pre-selected when possible. We map common brand hosts to their size query
// parameter conventions so the resulting URL drops the user straight into the
// product page with the right size highlighted.
//
// IMPORTANT: This is a best-effort enrichment. If the URL host is unknown, we
// open the original URL untouched.

import { Linking } from "react-native";
import { StyleProfile } from "@/src/api";

type Conv = {
  match: (host: string) => boolean;
  /** Returns query param name → size value mapping. Returning null skips. */
  param: (size: SizeContext) => Record<string, string> | null;
};

export type SizeContext = {
  topSize?: string | null;
  bottomSize?: string | null;
  shoeSize?: string | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipsCm?: number | null;
};

function pickClothingSize(ctx: SizeContext): string | null {
  return ctx.topSize || ctx.bottomSize || null;
}

const CONVENTIONS: Conv[] = [
  // Zara — "?v1=<articleId>&size=M" style. We can only add `size` param.
  { match: (h) => /zara\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // ASOS — "?selectedColour=…&clr=…&size=M" → uses `size`.
  { match: (h) => /asos\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // H&M — uses `size` in PDP, but also requires articleCode; we only append size.
  { match: (h) => /(^|\.)hm\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Uniqlo — "?colorDisplayCode=…&sizeCode=M"
  { match: (h) => /uniqlo\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { sizeCode: pickClothingSize(c)! } : null) },
  // Nike — "?size=M" works on most US PDPs.
  { match: (h) => /nike\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Adidas — "?size=M" works.
  { match: (h) => /adidas\.(com|us|uk|de)/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Shein — "?goods_id=…&attr_id_222=…" too brand-specific to inject; we still pass `size` as soft hint.
  { match: (h) => /shein\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Nordstrom — `?size=Medium`.
  { match: (h) => /nordstrom\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Amazon Fashion — search uses `size=M` filter on dropdown PDP variation; non-perfect but harmless.
  { match: (h) => /amazon\./i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
  // Myntra — `?p=…&size=M` deep links are best-effort.
  { match: (h) => /myntra\.com/i.test(h), param: (c) => (pickClothingSize(c) ? { size: pickClothingSize(c)! } : null) },
];

/** Pull the most relevant size context from the profile. */
export function ctxFromProfile(p: Partial<StyleProfile> | null | undefined): SizeContext {
  if (!p) return {};
  // The profile doesn't have explicit top/bottom size text — derive from
  // numeric chest/waist where possible, else fall back to shoe_size only.
  const inferTop = (() => {
    const chest = p.chest_cm ?? null;
    if (!chest) return null;
    if (chest < 88) return "XS";
    if (chest < 94) return "S";
    if (chest < 100) return "M";
    if (chest < 108) return "L";
    if (chest < 116) return "XL";
    return "XXL";
  })();
  const inferBottom = (() => {
    const w = p.waist_cm ?? null;
    if (!w) return null;
    if (w < 72) return "XS";
    if (w < 78) return "S";
    if (w < 86) return "M";
    if (w < 94) return "L";
    if (w < 102) return "XL";
    return "XXL";
  })();
  return {
    topSize: inferTop,
    bottomSize: inferBottom,
    shoeSize: p.shoe_size ?? null,
    waistCm: p.waist_cm ?? null,
    chestCm: p.chest_cm ?? null,
    hipsCm: p.hips_cm ?? null,
  };
}

/** Append size params to a wishlist URL based on host conventions. */
export function enrichProductUrl(url: string, ctx: SizeContext): string {
  try {
    const u = new URL(url);
    const conv = CONVENTIONS.find((c) => c.match(u.hostname));
    if (!conv) return url;
    const params = conv.param(ctx);
    if (!params) return url;
    Object.entries(params).forEach(([k, v]) => {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    });
    return u.toString();
  } catch {
    return url;
  }
}

/** Open the URL with size pre-select appended. Returns the final URL used. */
export async function openProductWithSize(url: string, ctx: SizeContext): Promise<string> {
  const enriched = enrichProductUrl(url, ctx);
  try {
    await Linking.openURL(enriched);
  } catch {
    // fallback to original
    await Linking.openURL(url);
  }
  return enriched;
}

/** A short human label describing how the user's size will be applied. */
export function describeSizeContext(ctx: SizeContext): string | null {
  const parts: string[] = [];
  if (ctx.topSize) parts.push(`Top ${ctx.topSize}`);
  if (ctx.bottomSize && ctx.bottomSize !== ctx.topSize) parts.push(`Bottom ${ctx.bottomSize}`);
  if (ctx.shoeSize) parts.push(`Shoe ${ctx.shoeSize}`);
  if (!parts.length) return null;
  return parts.join(" · ");
}
