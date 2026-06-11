import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Theme } from "@/lib/types";

interface ThemeEditorProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeEditor({ theme, onChange }: ThemeEditorProps) {
  const update = (key: keyof Theme, value: string) => {
    onChange({ ...theme, [key]: value });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-card">
      <h3 className="font-semibold text-sm">Visual Theme</h3>
      <div className="grid grid-cols-2 gap-4">
        <ColorInput label="Primary" value={theme.primary} onChange={(v) => update("primary", v)} />
        <ColorInput label="Background" value={theme.background} onChange={(v) => update("background", v)} />
        <ColorInput label="Foreground" value={theme.foreground} onChange={(v) => update("foreground", v)} />
        <ColorInput label="Accent" value={theme.accent} onChange={(v) => update("accent", v)} />
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input 
          type="color" 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="h-8 w-8 rounded cursor-pointer border-0 p-0" 
        />
        <Input 
          className="h-8 text-xs font-mono" 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
        />
      </div>
    </div>
  );
}
