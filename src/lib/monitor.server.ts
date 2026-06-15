// Server-only: persist AI call metrics to ai_logs.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AILogEntry = {
  model: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  tokenCount?: number | null;
  projectId?: string | null;
};

export async function logAICall(entry: AILogEntry): Promise<void> {
  try {
    await supabaseAdmin.from("ai_logs").insert({
      model: entry.model,
      latency_ms: entry.latencyMs,
      success: entry.success,
      error_message: entry.errorMessage ?? null,
      token_count: entry.tokenCount ?? null,
      project_id: entry.projectId ?? null,
    });
  } catch (e) {
    // Never let monitoring crash the AI call.
    console.error("[ai_logs] insert failed:", e);
  }
}
