import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Proxies chat requests from generated apps (ai_runtime === 'lovable') to the
// Lovable AI Gateway so the app never sees our API key.
// Apps in 'remote' or 'on-device' mode never call this endpoint.

const ALLOWED_MODELS = new Set([
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
]);
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGE_CHARS = 10_000;
const MAX_TOTAL_CHARS = 60_000;

// Per-instance token-bucket rate limit, keyed by `${slug}:${ip}`.
// Best-effort: workers are stateless across instances, but this short-circuits
// a single attacker on a single instance from spamming the upstream.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_MAX_REQUESTS) return false;
  b.count += 1;
  return true;
}

export const Route = createFileRoute("/api/public/ai/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("slug, is_published, ai_runtime")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!project || !project.is_published) {
          return new Response("Not found", { status: 404 });
        }
        if (project.ai_runtime !== "lovable") {
          return new Response("This app uses a different AI runtime", { status: 400 });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (!rateLimit(`${params.slug}:${ip}`)) {
          return new Response("Rate limit exceeded", { status: 429 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        let body: { messages?: Array<{ role: string; content: string }>; model?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }
        if (body.messages.length > 40) {
          return new Response("Too many messages", { status: 400 });
        }

        let total = 0;
        for (const m of body.messages) {
          if (
            !m ||
            typeof m.role !== "string" ||
            typeof m.content !== "string" ||
            !["system", "user", "assistant"].includes(m.role)
          ) {
            return new Response("Invalid message", { status: 400 });
          }
          if (m.content.length > MAX_MESSAGE_CHARS) {
            return new Response("Message too long", { status: 400 });
          }
          total += m.content.length;
          if (total > MAX_TOTAL_CHARS) {
            return new Response("Payload too large", { status: 400 });
          }
        }

        const model =
          typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
            ? body.model
            : DEFAULT_MODEL;

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: body.messages.slice(-40),
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          return new Response(text || "AI error", { status: upstream.status });
        }
        const data = await upstream.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        return new Response(JSON.stringify({ content }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
