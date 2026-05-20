import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAIWithTool, generateImage } from "./ai.server";
import { slugify } from "./slug";
import type { AppSpec, Theme } from "./types";

const SYSTEM_GENERATE = `You design small, polished, multi-page mobile web apps for non-technical creators.

Output a single tool call producing an app spec. Rules:
- 2 to 5 tabs, each tab is a single HTML body fragment (NO <html>, <head>, <body>, no <script src=...>).
- Inline <script> blocks are allowed and execute on tab show; keep them short, vanilla JS only.
- Use Tailwind utility classes freely (Tailwind CDN is already loaded). Use the CSS vars --primary, --background, --foreground, --accent for theme colors.
- Use window.appStorage.get(key, fallback) / appStorage.set(key, value) for per-device persistence. Do NOT use any external SDKs, APIs, or imports.
- Never include login/signup, payment forms, fake premium toggles, ads, or analytics.
- Tab icons must be a single emoji.
- Theme colors must be valid hex.
- Each tab should be visually rich, with real interactive content—not placeholders.
- Use semantic, attractive layouts: cards, lists, inputs, buttons styled with .gen-btn-primary and .gen-card.`;

const TOOL_GENERATE = {
  type: "function" as const,
  function: {
    name: "emit_app_spec",
    description: "Emit the generated multi-page app spec.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        template_family: {
          type: "string",
          enum: ["tracker", "list", "planner", "catalog", "utility", "social-lite"],
        },
        tabs: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              icon: { type: "string" },
              html: { type: "string" },
            },
            required: ["name", "icon", "html"],
          },
        },
        theme: {
          type: "object",
          properties: {
            primary: { type: "string" },
            background: { type: "string" },
            foreground: { type: "string" },
            accent: { type: "string" },
          },
          required: ["primary", "background", "foreground", "accent"],
        },
        icon_prompt: { type: "string", description: "Prompt for an app icon image, square, flat, modern." },
        persistence: { type: "string", enum: ["local", "synced"] },
      },
      required: ["title", "template_family", "tabs", "theme", "icon_prompt", "persistence"],
    },
  },
};

function validateSpec(spec: AppSpec): string[] {
  const errs: string[] = [];
  if (!spec.title || spec.title.length > 60) errs.push("title missing or too long");
  if (!Array.isArray(spec.tabs) || spec.tabs.length < 2 || spec.tabs.length > 5)
    errs.push("must have 2–5 tabs");
  for (const t of spec.tabs ?? []) {
    if (!t.html || t.html.length < 30) errs.push(`tab "${t.name}" html too short`);
    if (/<\s*(html|head|body)\b/i.test(t.html ?? "")) errs.push(`tab "${t.name}" must not include html/head/body`);
    if (/<script[^>]*src=/i.test(t.html ?? "")) errs.push(`tab "${t.name}" must not load external scripts`);
  }
  for (const k of ["primary", "background", "foreground", "accent"] as (keyof Theme)[]) {
    const v = spec.theme?.[k];
    if (!v || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) errs.push(`theme.${k} invalid hex`);
  }
  return errs;
}

async function generateSpec(prompt: string): Promise<AppSpec> {
  const messages = [
    { role: "system" as const, content: SYSTEM_GENERATE },
    { role: "user" as const, content: `App idea: ${prompt}` },
  ];
  let spec = await callAIWithTool<AppSpec>({
    model: "google/gemini-3-flash-preview",
    messages,
    tool: TOOL_GENERATE,
  });
  let errs = validateSpec(spec);
  if (errs.length > 0) {
    const retry = await callAIWithTool<AppSpec>({
      model: "google/gemini-3-flash-preview",
      messages: [
        ...messages,
        {
          role: "user",
          content: `Your previous output failed validation:\n${errs.join("\n")}\nProduce a corrected spec.`,
        },
      ],
      tool: TOOL_GENERATE,
    });
    const retryErrs = validateSpec(retry);
    if (retryErrs.length === 0) spec = retry;
  }
  return spec;
}

async function uploadIcon(ownerId: string, projectId: string, prompt: string): Promise<string | null> {
  try {
    const img = await generateImage({
      prompt: `App icon: ${prompt}. Flat, modern, vibrant, single subject centered, no text, square, suitable for mobile home screen.`,
    });
    const path = `${ownerId}/${projectId}.png`;
    const buf = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
    const { error } = await supabaseAdmin.storage
      .from("app-icons")
      .upload(path, buf, { contentType: img.mimeType, upsert: true });
    if (error) {
      console.error("icon upload", error);
      return null;
    }
    const { data } = supabaseAdmin.storage.from("app-icons").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error("icon gen failed", e);
    return null;
  }
}

export const classifyAndGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ prompt: z.string().min(3).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const spec = await generateSpec(data.prompt);

    const slug = slugify(spec.title);
    const projectId = crypto.randomUUID();

    // Insert project first so we can use id in storage path.
    const { error: projErr } = await supabaseAdmin.from("projects").insert({
      id: projectId,
      owner_id: userId,
      slug,
      title: spec.title,
      prompt: data.prompt,
      template_family: spec.template_family,
      theme: spec.theme,
    });
    if (projErr) throw new Error(projErr.message);

    const { data: versionRow, error: vErr } = await supabaseAdmin
      .from("project_versions")
      .insert({
        project_id: projectId,
        version_num: 1,
        tabs: spec.tabs,
        created_by_message: data.prompt,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);

    const iconUrl = await uploadIcon(userId, projectId, spec.icon_prompt);

    await supabaseAdmin
      .from("projects")
      .update({ current_version_id: versionRow.id, icon_url: iconUrl })
      .eq("id", projectId);

    await supabaseAdmin.from("project_messages").insert([
      { project_id: projectId, role: "user", content: data.prompt },
      {
        project_id: projectId,
        role: "assistant",
        content: `Generated ${spec.title} with ${spec.tabs.length} tabs.`,
        version_id_after: versionRow.id,
      },
    ]);

    return { projectId, slug };
  });

export const refineProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), message: z.string().min(1).max(2000) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, owner_id, title, prompt, theme, current_version_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== userId) throw new Error("Not found");

    const { data: current } = await supabaseAdmin
      .from("project_versions")
      .select("tabs, version_num")
      .eq("id", project.current_version_id)
      .single();
    if (!current) throw new Error("No current version");

    const messages = [
      { role: "system" as const, content: SYSTEM_GENERATE },
      {
        role: "user" as const,
        content: `Existing app spec:\n${JSON.stringify({
          title: project.title,
          theme: project.theme,
          tabs: current.tabs,
        })}\n\nUser refinement: ${data.message}\n\nReturn a complete new app spec applying the refinement. Keep prior content unless the user asked to change it.`,
      },
    ];
    let spec = await callAIWithTool<AppSpec>({
      model: "google/gemini-3-flash-preview",
      messages,
      tool: TOOL_GENERATE,
    });
    const errs = validateSpec(spec);
    if (errs.length > 0) {
      spec = await callAIWithTool<AppSpec>({
        model: "google/gemini-3-flash-preview",
        messages: [
          ...messages,
          { role: "user", content: `Validation failed:\n${errs.join("\n")}\nFix and return again.` },
        ],
        tool: TOOL_GENERATE,
      });
    }

    const newVersionNum = (current.version_num ?? 1) + 1;
    const { data: v, error } = await supabaseAdmin
      .from("project_versions")
      .insert({
        project_id: data.projectId,
        version_num: newVersionNum,
        tabs: spec.tabs,
        created_by_message: data.message,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("projects")
      .update({
        current_version_id: v.id,
        title: spec.title,
        theme: spec.theme,
      })
      .eq("id", data.projectId);

    await supabaseAdmin.from("project_messages").insert([
      { project_id: data.projectId, role: "user", content: data.message },
      {
        project_id: data.projectId,
        role: "assistant",
        content: `Updated. Now ${spec.tabs.length} tabs.`,
        version_id_after: v.id,
      },
    ]);

    return { versionId: v.id };
  });

export const revertToVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== userId) throw new Error("Not found");
    await supabaseAdmin
      .from("projects")
      .update({ current_version_id: data.versionId })
      .eq("id", data.projectId);
    return { ok: true };
  });

export const updateProjectMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(60).optional(),
        theme: z
          .object({
            primary: z.string(),
            background: z.string(),
            foreground: z.string(),
            accent: z.string(),
          })
          .optional(),
        is_published: z.boolean().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.is_published !== undefined) patch.is_published = data.is_published;
    const { error } = await supabaseAdmin
      .from("projects")
      .update(patch)
      .eq("id", data.projectId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), prompt: z.string().min(3).max(500) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== userId) throw new Error("Not found");
    const url = await uploadIcon(userId, data.projectId, data.prompt);
    if (!url) throw new Error("Image generation failed");
    await supabaseAdmin.from("projects").update({ icon_url: url }).eq("id", data.projectId);
    return { iconUrl: url };
  });
