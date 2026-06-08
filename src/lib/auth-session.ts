import { supabase } from "@/integrations/supabase/client";

const SESSION_RETRY_DELAY_MS = 150;

export async function getStableSession() {
  const first = await supabase.auth.getSession();
  if (first.data.session) {
    return first.data.session;
  }

  await new Promise((resolve) => setTimeout(resolve, SESSION_RETRY_DELAY_MS));

  const second = await supabase.auth.getSession();
  return second.data.session ?? null;
}