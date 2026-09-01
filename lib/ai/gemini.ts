// Minimal server-side Gemini client. Requires GEMINI_API_KEY as a Vercel
// environment variable (Section 50 — Security). Never call this from a
// Client Component.
//
// Uses Google AI Studio's free-tier Gemini API (no credit card required).
// Get a key at https://aistudio.google.com/apikey
//
// Model choice:
//   - gemini-3.6-flash       -> better quality, standard free-tier quota
//   - gemini-3.5-flash-lite  -> higher free daily quota, slightly weaker
// Override with the GEMINI_MODEL env var if you want to switch without a
// code change.
//
// Google renames/deprecates model IDs more often than you'd expect —
// gemini-2.5-flash, the original default here, was retired for new users
// in mid-2026. If calls start failing with a 404 naming a "no longer
// available" model, that error message tells you the exact replacement ID
// to use — put it in GEMINI_MODEL rather than waiting for another swap.
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Google's actual free-tier limit for gemini-3.6-flash, taken directly
// from a 429 response body: 5 requests/minute per project per model (see
// generativelanguage.googleapis.com/generate_content_free_tier_requests).
// That's much tighter than generic "10-15 RPM" estimates floating around
// online — trust the number in your own error responses over any
// documentation or blog post, since Google adjusts these per model and
// per account tier without much notice.
//
// Spacing calls 13s apart caps us at ~4.6 calls/min, just under the limit
// with margin for clock drift. This is a simple in-process spacer using a
// module-level timestamp — it only helps within a single warm function
// invocation (which is exactly the case that matters: one run makes
// several calls back-to-back), not across separate invocations.
const MIN_CALL_INTERVAL_MS = 13000;
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await sleep(MIN_CALL_INTERVAL_MS - elapsed);
  }
  lastCallAt = Date.now();
}

// Parses the retryDelay Google suggests in a 429 body (e.g. "38s") so a
// retry actually waits long enough to succeed, instead of guessing.
function parseRetryDelaySeconds(errorBodyText: string): number | null {
  try {
    const parsed = JSON.parse(errorBodyText);
    const retryInfo = parsed?.error?.details?.find(
      (d: { "@type"?: string }) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
    );
    const raw: string | undefined = retryInfo?.retryDelay; // e.g. "38s"
    if (!raw) return null;
    const seconds = parseFloat(raw.replace("s", ""));
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

// gemini-3.6-flash's free tier has TWO separate limits, confirmed from live
// 429 responses: ~5 requests/minute (quotaId contains "PerMinute") AND a
// much tighter 20 requests/DAY total (quotaId contains "PerDay",
// quotaValue "20" as of Aug 2026 — Google can change this without notice).
// A per-minute 429 is worth waiting out (it'll pass within a minute); a
// per-day 429 will not resolve by waiting 15-20s, so retrying just burns
// part of the 60s function budget for nothing. This checks which one it
// actually is instead of assuming.
function isDailyQuotaExceeded(errorBodyText: string): boolean {
  try {
    const parsed = JSON.parse(errorBodyText);
    const quotaFailure = parsed?.error?.details?.find(
      (d: { "@type"?: string }) => d["@type"] === "type.googleapis.com/google.rpc.QuotaFailure"
    );
    const quotaId: string | undefined = quotaFailure?.violations?.[0]?.quotaId;
    return Boolean(quotaId && quotaId.includes("PerDay"));
  } catch {
    return false;
  }
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export async function callClaude(params: {
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment.");
  }

  // Gemini has no "assistant" role — it uses "model" instead.
  const contents = params.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: params.system }] },
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 2000,
      // NOTE: previously tried thinkingConfig: { thinkingBudget: 0 } here
      // to stop Gemini's hidden "thinking" tokens from eating the output
      // budget (see the maxTokens bump in classify.ts/analyze-impact.ts/
      // generate-brief.ts for the actual context). That field caused every
      // call to fail with "400 INVALID_ARGUMENT" for gemini-3.6-flash — the
      // 3.x model family likely expects `thinkingLevel` (e.g. "low")
      // instead of the 2.5-series `thinkingBudget`, and this endpoint
      // rejects the whole request rather than ignoring an unrecognized
      // field. Given the account's daily quota is only 20 requests, this
      // isn't worth re-guessing at without a way to test it directly — the
      // generous maxTokens increase alone (see the three callers) already
      // fixes the truncation this was meant to address, just without
      // trimming the hidden reasoning tokens. If you want to try re-adding
      // thinking control later, check the current Gemini API docs for the
      // exact field your configured GEMINI_MODEL expects before shipping it.
    },
  });

  // One retry on 429, honoring Google's own suggested wait time (capped —
  // see below) rather than guessing. Everything else (network errors, 4xx
  // other than 429, 5xx) is not retried here: the caller (e.g.
  // processUnanalyzedRawDocuments in lib/intelligence/pipeline.ts) already
  // treats a failed document as "leave it unprocessed, pick it up next
  // run" rather than crashing the whole batch, so there's no need to be
  // clever about retries at this layer for anything but the rate limit.
  for (let attempt = 0; attempt < 2; attempt++) {
    await waitForRateLimit();

    const res = await fetch(`${GEMINI_API_URL}/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("\n");

      if (!text) {
        // e.g. finishReason "MAX_TOKENS" with no usable text, or a safety block
        throw new Error(`Gemini returned no text. finishReason=${candidate?.finishReason ?? "unknown"}`);
      }

      return text;
    }

    const errorText = await res.text();

    if (res.status === 429 && attempt === 0 && !isDailyQuotaExceeded(errorText)) {
      // Cap the wait at 20s — inside a 60s Vercel function budget, honoring
      // a 38+ second suggested delay verbatim would risk the whole request
      // getting killed mid-retry with nothing to show for it. If 20s isn't
      // enough, we fall through to the throw below and this document just
      // stays unprocessed until the next run — no data is lost.
      const suggested = parseRetryDelaySeconds(errorText);
      const waitSeconds = Math.min(suggested ?? 15, 20);
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (res.status === 429 && isDailyQuotaExceeded(errorText)) {
      // Don't bother waiting — the daily cap won't reset for hours, so a
      // 15-20s retry would just fail again and waste function time. Fail
      // fast with a clear message instead.
      throw new Error(
        `Gemini API error 429: daily free-tier quota exhausted for ${MODEL}. This resets roughly 24h after ` +
          `your first request of the day — try again tomorrow, or switch GEMINI_MODEL to a model with separate ` +
          `quota. Raw response: ${errorText}`
      );
    }

    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
  }

  // Unreachable in practice (the loop always returns or throws above), but
  // keeps TypeScript happy about a guaranteed return type.
  throw new Error("Gemini API error: exhausted retries");
}

/** Calls Gemini and parses a strict-JSON response, stripping code fences. */
export async function callClaudeJson<T>(params: {
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
}): Promise<T> {
  const raw = await callClaude(params);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // A response that doesn't end in "}" almost always means it got cut
    // off mid-generation (hit maxOutputTokens) rather than the model
    // producing genuinely malformed JSON — worth saying explicitly so a
    // future "Unterminated string" error doesn't need re-diagnosing from
    // scratch. If this keeps happening after the maxTokens bump in
    // classify.ts/analyze-impact.ts/generate-brief.ts, raise it further.
    const looksTruncated = !cleaned.trim().endsWith("}");
    const hint = looksTruncated
      ? " (response does not end in '}' — looks truncated; consider raising maxTokens for this call)"
      : "";
    throw new Error(
      `Failed to parse Gemini JSON response: ${(err as Error).message}${hint}\nRaw: ${raw.slice(0, 500)}`
    );
  }
}
