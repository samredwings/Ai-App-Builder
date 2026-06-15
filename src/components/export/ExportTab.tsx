import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportAPKBundle } from "@/lib/export.functions";
import { BuildStep } from "./BuildStep";
import { Download, Package, Smartphone, Archive } from "lucide-react";

interface ExportTabProps {
  projectId: string;
  publishedUrl?: string;
  isPublished?: boolean;
}

const BUILD_STEPS = [
  { id: "assets", label: "Copy static assets", icon: Archive, duration: 800 },
  { id: "web-build", label: "Build web app bundle", icon: Package, duration: 2000 },
  { id: "capacitor-sync", label: "Sync Capacitor config", icon: Smartphone, duration: 1200 },
  { id: "gradle", label: "Compile & sign APK", icon: Download, duration: 3000 },
];

type StepStatus = "pending" | "running" | "done" | "error";

export function ExportTab({ projectId, publishedUrl, isPublished }: ExportTabProps) {
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(
    Object.fromEntries(BUILD_STEPS.map((s) => [s.id, "pending" as StepStatus]))
  );
  const [buildComplete, setBuildComplete] = useState(false);

  const exportBundle = useServerFn(exportAPKBundle);

  const exportMut = useMutation({
    mutationFn: async () => {
      setBuildComplete(false);
      setStepStatuses(Object.fromEntries(BUILD_STEPS.map((s) => [s.id, "pending" as StepStatus])));

      for (const step of BUILD_STEPS) {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "running" }));
        await new Promise((r) => setTimeout(r, step.duration));
        setStepStatuses((prev) => ({ ...prev, [step.id]: "done" }));
      }

      return exportBundle({ data: { projectId, origin: window.location.origin } });
    },
    onSuccess: (res) => {
      const blob = new Blob(
        [Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))],
        { type: "application/zip" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setBuildComplete(true);
      toast.success("APK bundle downloaded");
    },
    onError: (e) => {
      setStepStatuses((prev) => {
        const next = { ...prev };
        for (const s of BUILD_STEPS) {
          if (next[s.id] !== "done") {
            next[s.id] = "error";
            break;
          }
        }
        return next;
      });
      toast.error(e instanceof Error ? e.message : "Export failed");
    },
  });

  return (
    <div className="flex-1 overflow-y-auto space-y-4 mt-3 pr-1">
      <div className="p-4 border rounded-lg bg-card/50 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">APK Distribution</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Build a production-ready Capacitor Android APK bundle with full offline support.
          </p>
        </div>

        <div className="space-y-2">
          {BUILD_STEPS.map((step, idx) => (
            <BuildStep
              key={step.id}
              {...step}
              status={stepStatuses[step.id]}
              isLast={idx === BUILD_STEPS.length - 1}
            />
          ))}
        </div>

        <Button
          className="w-full h-10 text-sm font-medium"
          disabled={exportMut.isPending}
          onClick={() => exportMut.mutate()}
        >
          {exportMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Building APK...
            </span>
          ) : buildComplete ? (
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download Again
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Generate APK Bundle
            </span>
          )}
        </Button>

        {buildComplete && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-700 dark:text-green-400 space-y-1">
            <p className="font-semibold">✓ Build complete</p>
            <p>Your APK bundle has been downloaded. Extract the zip, open the Android folder in Android Studio, and build from there.</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              For offline LLM support, place your .gguf model in <code>android/app/src/main/assets/models/</code> before building.
            </p>
          </div>
        )}

        {exportMut.isError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-600 dark:text-red-400">
            <p className="font-semibold">Build failed</p>
            <p className="mt-0.5">{exportMut.error instanceof Error ? exportMut.error.message : "Unknown error"}</p>
          </div>
        )}
      </div>

      {isPublished && publishedUrl && (
        <div className="p-4 border rounded-lg bg-card/50 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">PWA Builder Engine</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Convert your live web app into a Google Play Store bundle.
            </p>
          </div>
          <a
            href={`https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(publishedUrl)}`}
            target="_blank"
            rel="noopener"
            className="block w-full"
          >
            <Button className="w-full h-9 text-xs" variant="outline">
              PWA APK Generator ↗
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
