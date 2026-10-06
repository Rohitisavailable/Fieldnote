import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = [
  "https://trailside.onrender.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const DAILY_LIMIT = 12;
const MAX_NOTE_LENGTH = 420;
const SYSTEM_PROMPT = "You are Fieldnote, a gentle outdoor observation companion. Turn the user's field note into one specific, safe, sensory prompt that takes about one minute and invites the person to put their phone away. Do not identify species, infer that an animal is present beyond what the user said, suggest approaching/tracking wildlife, or give safety advice. Use one or two short sentences in plain language. Do not mention that you are an AI.";

function allowedOrigins(): string[] {
  const configured = Deno.env.get("FIELDNOTE_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ORIGINS;
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, x-supabase-api-version, content-type",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function userIdFromVerifiedJwt(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+([^.]+)\.([^.]+)\.[^.]+$/i);
  if (!match) return null;
  try {
    const payload = match[2].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    // The Supabase gateway verifies the JWT signature because verify_jwt=true.
    return typeof claims.sub === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.sub)
      ? claims.sub
      : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins().includes(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (origin && !allowedOrigins().includes(origin)) {
    return jsonResponse({ error: "Origin not allowed." }, 403, origin);
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, origin);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_192) return jsonResponse({ error: "Request is too large." }, 413, origin);

  const userId = userIdFromVerifiedJwt(request.headers.get("authorization"));
  if (!userId) return jsonResponse({ error: "A signed-in guest session is required." }, 401, origin);

  let input: { note?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Request must contain JSON." }, 400, origin);
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!note || note.length > MAX_NOTE_LENGTH) {
    return jsonResponse({ error: `Note must contain 1 to ${MAX_NOTE_LENGTH} characters.` }, 400, origin);
  }

  const backboardKey = Deno.env.get("TRAILSIDE_BACKBOARD_API_KEY");
  const provider = Deno.env.get("BACKBOARD_LLM_PROVIDER");
  const model = Deno.env.get("BACKBOARD_MODEL_NAME");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!backboardKey || !provider || !model || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Hosted model configuration is incomplete." }, 503, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: allowed, error: quotaError } = await admin.rpc("consume_fieldnote_generation", {
    p_user_id: userId,
    p_daily_limit: DAILY_LIMIT,
  });
  if (quotaError) {
    console.error("Fieldnote quota check failed:", quotaError.message);
    return jsonResponse({ error: "Hosted prompt limits could not be checked." }, 503, origin);
  }
  if (allowed !== true) return jsonResponse({ error: "Daily hosted-prompt limit reached." }, 429, origin);

  try {
    const response = await fetch("https://app.backboard.io/api/threads/messages", {
      method: "POST",
      headers: {
        "X-API-Key": backboardKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: note,
        system_prompt: SYSTEM_PROMPT,
        llm_provider: provider,
        model_name: model,
        memory: "off",
        web_search: "off",
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("Backboard request failed with status:", response.status);
      return jsonResponse({ error: "Backboard could not generate a prompt." }, 502, origin);
    }
    const result = await response.json();
    const prompt = typeof result.content === "string" ? result.content.trim() : "";
    if (!prompt) return jsonResponse({ error: "Backboard returned an empty prompt." }, 502, origin);
    return jsonResponse({ prompt }, 200, origin);
  } catch (error) {
    console.error("Backboard request failed:", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({ error: "Hosted model request timed out or could not connect." }, 502, origin);
  }
});
