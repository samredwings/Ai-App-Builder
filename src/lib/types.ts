export type Tab = {
  name: string;
  icon: string;
  html: string;
};

export type Theme = {
  primary: string;
  background: string;
  foreground: string;
  accent: string;
};

export type AIRuntime = "lovable" | "remote" | "on-device";

export type AIConfig = {
  runtime: AIRuntime;
  remoteEndpoint?: string | null;
  remoteModel?: string | null;
  ondeviceModel?: string | null;
};

export type AppSpec = {
  title: string;
  template_family:
    | "tracker"
    | "list"
    | "planner"
    | "catalog"
    | "utility"
    | "social-lite";
  tabs: Tab[];
  theme: Theme;
  icon_prompt: string;
  persistence: "local" | "synced";
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

