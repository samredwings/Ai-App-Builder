import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Proxies chat requests from generated apps (ai_runtime === 'lovable') to the
// Lovable AI Gateway so the app never sees our API key.
// Apps in 'remote' or 'on-device' mode never call this endpoint.
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

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: body.model ?? "google/gemini-2.5-flash",
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
