import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/manifest/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("slug, title, theme, icon_url, is_published")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!project || !project.is_published) {
          return new Response("Not found", { status: 404 });
        }
        const theme = project.theme as { primary?: string; background?: string };
        const manifest = {
          name: project.title,
          short_name: project.title.slice(0, 12),
          start_url: `/a/${project.slug}`,
          scope: `/a/${project.slug}`,
          display: "standalone",
          background_color: theme.background ?? "#ffffff",
          theme_color: theme.primary ?? "#4f46e5",
          icons: project.icon_url
            ? [
                { src: project.icon_url, sizes: "512x512", type: "image/png", purpose: "any" },
                { src: project.icon_url, sizes: "192x192", type: "image/png", purpose: "any" },
              ]
            : [],
        };
        return new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json",
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
