export type Tab = {
  name: string;
  icon: string; // emoji or lucide-name; we render as text
  html: string; // raw HTML body for this tab
};

export type Theme = {
  primary: string;
  background: string;
  foreground: string;
  accent: string;
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
