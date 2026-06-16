import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAIWithTool } from "./ai.server";

type Requirement = {
  id: string;
  text: string;
  source: "original" | "added" | "changed" | "manual";
  status: "planned" | "done" | "changed" | "removed";
  position: number;
  version_first_seen: number | null;
};

type Tab = { name: string; icon: string; html: string };

// ---------- Static testing (worker-safe, no browser) ----------

export type StaticIssue = {
  tab: string;
  severity: "error" | "warning";
  message: string;
};

export function runStaticChecks(tabs: Tab[]): StaticIssue[] {
  const issues: StaticIssue[] = [];
  for (const tab of tabs) {
    const html = tab.html ?? "";
    if (/<\s*(html|head|body)\b/i.test(html))
      issues.push({ tab: tab.name, severity: "error", message: "Contains forbidden <html>/<head>/<body> tag" });
    if (/<script[^>]*\bsrc=/i.test(html))
      issues.push({ tab: tab.name, severity: "error", message: "External <script src> is not allowed" });
    if (html.length < 30)
      issues.push({ tab: tab.name, severity: "warning", message: "Tab content is suspiciously short" });

    // Extract inline <script> bodies and parse for syntax errors
    const scripts: string[] = [];
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html))) scripts.push(m[1]);
    const declaredFns = new Set<string>();
    for (const code of scripts) {
      try {
        new Function(code);
      } catch (e) {
        issues.push({
          tab: tab.name,
          severity: "error",
          message: `Script syntax error: ${(e as Error).message.slice(0, 100)}`,
        });
      }
      for (const fm of code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) declaredFns.add(fm[1]);
      for (const fm of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\()/g))
        declaredFns.add(fm[1]);
      for (const fm of code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) declaredFns.add(fm[1]);
    }

    // onclick="foo(...)" / onchange="bar()" handlers referring to fns that don't exist
    const inlineHandlerRe = /\son(?:click|change|input|submit|blur|focus|keyup|keydown)\s*=\s*["']\s*([A-Za-z_$][\w$.]*)\s*\(/gi;
    const referencedFns = new Set<string>();
    let h: RegExpExecArray | null;
    while ((h = inlineHandlerRe.exec(html))) {
      const name = h[1].split(".")[0];
      // Common built-ins / globals to skip
      if (["return", "alert", "console", "window", "document", "appStorage", "appAI", "event"].includes(name)) continue;
      referencedFns.add(name);
    }
    for (const fn of referencedFns) {
      if (!declaredFns.has(fn))
        issues.push({
          tab: tab.name,
          severity: "warning",
          message: `Inline handler references undefined function: ${fn}()`,
        });
    }

    // getElementById('x') referring to id not present
    const ids = new Set<string>();
    for (const im of html.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(im[1]);
    for (const gm of html.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!ids.has(gm[1]))
        issues.push({
          tab: tab.name,
          severity: "warning",
          message: `getElementById("${gm[1]}") targets an id that doesn't exist in this tab`,
        });
    }
  }
  return issues;
}

async function persistStaticRun(projectId: string, versionId: string | null, tabs: Tab[]) {
  const issues = runStaticChecks(tabs);
  const hasError = issues.some((i) => i.severity === "error");
  await supabaseAdmin.from("test_results").insert({
    project_id: projectId,
    version_id: versionId,
    kind: "static",
    passed: !hasError,
    issue_count: issues.length,
    issues,
  });
  return { passed: !hasError, issues };
}

export async function runStaticTestsForCurrentVersion(projectId: string) {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("current_version_id")
    .eq("id", projectId)
    .single();
  if (!project?.current_version_id) return { passed: true, issues: [] as StaticIssue[] };
  const { data: ver } = await supabaseAdmin
    .from("project_versions")
    .select("tabs")
    .eq("id", project.current_version_id)
    .single();
  const tabs = (ver?.tabs ?? []) as Tab[];
  return persistStaticRun(projectId, project.current_version_id, tabs);
}

export const runStaticTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== context.userId) throw new Error("Not found");
    return runStaticTestsForCurrentVersion(data.projectId);
  });

// ---------- BRD / Requirements ----------

const EXTRACT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_brd",
    description: "Update the living BRD for this app based on the latest user request and assistant reply.",
    parameters: {
      type: "object",
      properties: {
        add: {
          type: "array",
          description: "New requirements introduced by this turn.",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Concise requirement, e.g. 'User can add tasks with due dates'." },
              source: { type: "string", enum: ["original", "added", "changed"] },
            },
            required: ["text", "source"],
          },
        },
        mark_done: {
          type: "array",
          description: "IDs of existing requirements now fully implemented.",
          items: { type: "string" },
        },
        mark_changed: {
          type: "array",
          description: "IDs of existing requirements whose scope changed.",
          items: { type: "string" },
        },
        remove: {
          type: "array",
          description: "IDs of existing requirements explicitly removed by the user.",
          items: { type: "string" },
        },
      },
      required: [],
    },
  },
};

export async function extractRequirementsForTurn(opts: {
  projectId: string;
  versionNum: number;
  userMessage: string;
  assistantReply: string;
  isFirstTurn: boolean;
}) {
  const { data: existing } = await supabaseAdmin
    .from("requirements")
    .select("id, text, status, source, position")
    .eq("project_id", opts.projectId)
    .order("position", { ascending: true });

  const list = (existing ?? []) as Requirement[];

  const systemPrompt = `You maintain a living Business Requirements Document (BRD) for a mobile web app.
Given the user's latest request and the current requirement list, decide:
- Which NEW requirements to add (mark source="original" only on the very first turn, otherwise "added" for new asks or "changed" for scope changes).
- Which existing requirements (by id) are now fully done.
- Which existing requirements changed in scope.
- Which existing requirements the user explicitly asked to remove.

Keep each requirement short (max 100 chars), user-visible, and outcome-oriented (no implementation detail).
Do NOT re-add a requirement that already exists with similar meaning.
If nothing changed, return empty arrays.`;

  const userPrompt = `First turn: ${opts.isFirstTurn}
Current requirements (id | status | text):
${list.length === 0 ? "(none)" : list.map((r) => `${r.id} | ${r.status} | ${r.text}`).join("\n")}

User message:
${opts.userMessage}

Assistant reply:
${opts.assistantReply}`;

  let decision: {
    add?: { text: string; source: "original" | "added" | "changed" }[];
    mark_done?: string[];
    mark_changed?: string[];
    remove?: string[];
  };
  try {
    decision = await callAIWithTool({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tool: EXTRACT_TOOL,
      projectId: opts.projectId,
    });
  } catch (e) {
    console.error("[brd] extract failed:", e);
    return;
  }

  const existingIds = new Set(list.map((r) => r.id));
  const maxPos = list.reduce((m, r) => Math.max(m, r.position), -1);

  if (decision.add?.length) {
    const rows = decision.add
      .filter((r) => r.text && r.text.trim().length > 0)
      .map((r, i) => ({
        project_id: opts.projectId,
        text: r.text.trim().slice(0, 200),
        source: r.source,
        status: "planned" as const,
        position: maxPos + 1 + i,
        version_first_seen: opts.versionNum,
      }));
    if (rows.length) await supabaseAdmin.from("requirements").insert(rows);
  }
  if (decision.mark_done?.length) {
    const ids = decision.mark_done.filter((id) => existingIds.has(id));
    if (ids.length)
      await supabaseAdmin.from("requirements").update({ status: "done" }).in("id", ids);
  }
  if (decision.mark_changed?.length) {
    const ids = decision.mark_changed.filter((id) => existingIds.has(id));
    if (ids.length)
      await supabaseAdmin.from("requirements").update({ status: "changed" }).in("id", ids);
  }
  if (decision.remove?.length) {
    const ids = decision.remove.filter((id) => existingIds.has(id));
    if (ids.length)
      await supabaseAdmin.from("requirements").update({ status: "removed" }).in("id", ids);
  }
}

export const getRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== context.userId) throw new Error("Not found");

    const [{ data: reqs }, { data: tests }] = await Promise.all([
      supabaseAdmin
        .from("requirements")
        .select("id, text, source, status, position, version_first_seen, created_at, updated_at")
        .eq("project_id", data.projectId)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("test_results")
        .select("id, kind, passed, issue_count, issues, created_at, version_id")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    return { requirements: reqs ?? [], tests: tests ?? [] };
  });

export const updateRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        text: z.string().min(1).max(200).optional(),
        status: z.enum(["planned", "done", "changed", "removed"]).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    // RLS scopes to owner via projects join.
    const { data: row } = await supabaseAdmin
      .from("requirements")
      .select("id, project_id")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Not found");
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", row.project_id)
      .single();
    if (!proj || proj.owner_id !== context.userId) throw new Error("Not found");

    const patch: { text?: string; status?: string } = {};
    if (data.text !== undefined) patch.text = data.text;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await supabaseAdmin.from("requirements").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), text: z.string().min(1).max(200) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.owner_id !== context.userId) throw new Error("Not found");
    const { data: maxRow } = await supabaseAdmin
      .from("requirements")
      .select("position")
      .eq("project_id", data.projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    const { error } = await supabaseAdmin.from("requirements").insert({
      project_id: data.projectId,
      text: data.text,
      source: "manual",
      status: "planned",
      position: nextPos,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("requirements")
      .select("id, project_id")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Not found");
    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("owner_id")
      .eq("id", row.project_id)
      .single();
    if (!proj || proj.owner_id !== context.userId) throw new Error("Not found");
    await supabaseAdmin.from("requirements").delete().eq("id", data.id);
    return { ok: true };
  });
