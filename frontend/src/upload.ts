// Robust image upload helper for ClosetAI wardrobe photos.
// - Compresses with expo-image-manipulator (resize ≤1600px, JPEG q=0.7)
// - Retries failed network calls with exponential backoff (3 attempts)
// - Surfaces granular error reasons to callers
// - Logs structured details for developer debugging

import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

// Tunable upload bounds.
export const MAX_DIMENSION = 1600;          // px; aspect ratio preserved
export const TARGET_QUALITY = 0.7;          // JPEG quality (0..1)
export const MAX_BASE64_BYTES = 5 * 1024 * 1024; // 5 MB after compression
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 600;

export type UploadStage =
  | "compressing"
  | "uploading"
  | "retrying"
  | "done"
  | "error";

export type UploadProgress = {
  stage: UploadStage;
  attempt: number;
  totalAttempts: number;
  percent: number;          // 0..100 (best-effort; base64 in JSON is not chunked)
  message?: string;
};

export type UploadError = {
  code:
    | "compression_failed"
    | "too_large"
    | "network"
    | "timeout"
    | "server_5xx"
    | "client_4xx"
    | "aborted"
    | "unknown";
  message: string;
  attempts: number;
  detail?: string;
  status?: number;
};

export type CompressedImage = {
  base64: string;
  width: number;
  height: number;
  approxBytes: number;
};

export async function compressImage(uri: string): Promise<CompressedImage> {
  try {
    // Resize so longest edge is MAX_DIMENSION while keeping aspect ratio.
    // expo-image-manipulator accepts a single dimension and preserves ratio.
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      {
        compress: TARGET_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) {
      throw new Error("manipulator returned no base64");
    }
    // base64 length ~ ceil(bytes / 3) * 4 → approx bytes back
    const approxBytes = Math.floor((result.base64.length * 3) / 4);
    return {
      base64: result.base64,
      width: result.width,
      height: result.height,
      approxBytes,
    };
  } catch (e: any) {
    const detail = e?.message || String(e);
    // eslint-disable-next-line no-console
    console.warn("[upload] compression failed", { detail, uri, platform: Platform.OS });
    throw makeError("compression_failed", "Could not process this photo. Please try another image.", 0, detail);
  }
}

function makeError(
  code: UploadError["code"],
  message: string,
  attempts: number,
  detail?: string,
  status?: number,
): UploadError {
  return { code, message, attempts, detail, status };
}

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export type WithRetryOpts = {
  totalAttempts?: number;
  baseDelayMs?: number;
  onProgress?: (p: UploadProgress) => void;
  abortSignal?: AbortSignal;
  timeoutMs?: number; // per-attempt
};

/**
 * Wrap an async upload call (already produces a Promise) in retry + progress logic.
 * The inner `attempt` function must throw — for non-2xx HTTP, throw an Error whose
 * `.message` starts with "HTTP <status>: ..." so we can map to UploadError codes.
 */
export async function withRetry<T>(
  attempt: (signal?: AbortSignal) => Promise<T>,
  opts: WithRetryOpts = {},
): Promise<T> {
  const total = opts.totalAttempts ?? MAX_RETRIES;
  const base = opts.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let lastErr: UploadError | null = null;
  for (let i = 1; i <= total; i++) {
    if (opts.abortSignal?.aborted) {
      throw makeError("aborted", "Upload cancelled.", i - 1);
    }

    opts.onProgress?.({
      stage: i === 1 ? "uploading" : "retrying",
      attempt: i,
      totalAttempts: total,
      percent: 25 + (i - 1) * 20,
      message: i === 1 ? "Uploading…" : `Retrying (${i}/${total})…`,
    });

    // Per-attempt timeout via AbortController.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const linkAbort = () => ctrl.abort();
    opts.abortSignal?.addEventListener("abort", linkAbort);
    try {
      const result = await attempt(ctrl.signal);
      opts.onProgress?.({
        stage: "done",
        attempt: i,
        totalAttempts: total,
        percent: 100,
        message: "Saved",
      });
      return result;
    } catch (e: any) {
      const msg: string = e?.message || String(e);
      // eslint-disable-next-line no-console
      console.warn("[upload] attempt failed", { attempt: i, totalAttempts: total, msg });

      if (opts.abortSignal?.aborted || msg.toLowerCase().includes("abort")) {
        lastErr = makeError("aborted", "Upload cancelled.", i, msg);
        break;
      }

      // Map error
      const httpMatch = /^HTTP\s+(\d{3})/i.exec(msg);
      const status = httpMatch ? parseInt(httpMatch[1], 10) : undefined;
      if (status && status >= 400 && status < 500) {
        // 4xx is the client's fault → don't retry; fail fast with detail.
        lastErr = makeError("client_4xx", humanizeClient(status, msg), i, msg, status);
        break;
      }
      if (status && status >= 500) {
        lastErr = makeError("server_5xx", "Server hiccup. Retrying…", i, msg, status);
      } else if (/timeout|timed out/i.test(msg)) {
        lastErr = makeError("timeout", "Network is slow. Retrying…", i, msg);
      } else {
        lastErr = makeError("network", "Connection issue. Retrying…", i, msg);
      }
      // backoff with jitter
      if (i < total) {
        await sleep(base * Math.pow(2, i - 1) + Math.floor(Math.random() * 250));
      }
    } finally {
      clearTimeout(timer);
      opts.abortSignal?.removeEventListener("abort", linkAbort);
    }
  }

  // Exhausted retries (or fast-failed)
  if (lastErr) {
    opts.onProgress?.({
      stage: "error",
      attempt: lastErr.attempts,
      totalAttempts: total,
      percent: 0,
      message: lastErr.message,
    });
    throw lastErr;
  }
  throw makeError("unknown", "Upload failed for an unknown reason.", total);
}

function humanizeClient(status: number, raw: string): string {
  switch (status) {
    case 400:
      return "Photo was rejected. Please try a different one.";
    case 401:
    case 403:
      return "Your session expired. Sign in again.";
    case 404:
      return "Could not find the upload endpoint. Please update the app.";
    case 409:
      return "Looks like this item already exists.";
    case 413:
      return "Photo is too large after compression. Try a different shot.";
    case 415:
      return "Unsupported image format. Use JPG or PNG.";
    case 422:
      return raw.replace(/^HTTP\s+422[:\s]*/i, "Invalid data: ").slice(0, 160);
    case 429:
      return "Too many uploads — please wait a moment and try again.";
    default:
      return `Request rejected (${status}).`;
  }
}

export function isUploadError(e: unknown): e is UploadError {
  return !!e && typeof e === "object" && "code" in (e as any) && "message" in (e as any);
}
