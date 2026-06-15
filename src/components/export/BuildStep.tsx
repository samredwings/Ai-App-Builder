import { LucideIcon, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BuildStepProps {
  id: string;
  label: string;
  icon: LucideIcon;
  duration: number;
  status: "pending" | "running" | "done" | "error";
  isLast: boolean;
}

export function BuildStep({ label, icon: Icon, status, isLast }: BuildStepProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300",
            status === "done" && "bg-green-500/20 text-green-600",
            status === "running" && "bg-blue-500/20 text-blue-600",
            status === "error" && "bg-red-500/20 text-red-600",
            status === "pending" && "bg-muted text-muted-foreground"
          )}
        >
          {status === "done" && <CheckCircle2 className="w-3.5 h-3.5" />}
          {status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {status === "error" && <XCircle className="w-3.5 h-3.5" />}
          {status === "pending" && <Icon className="w-3.5 h-3.5" />}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-px h-4 my-0.5 transition-colors duration-300",
              status === "done" ? "bg-green-400" : "bg-border"
            )}
          />
        )}
      </div>

      <div className="flex-1 min-w-0 pt-1">
        <span
          className={cn(
            "text-xs font-medium transition-colors duration-300",
            status === "done" && "text-green-700 dark:text-green-400",
            status === "running" && "text-blue-700 dark:text-blue-400",
            status === "error" && "text-red-700 dark:text-red-400",
            status === "pending" && "text-muted-foreground"
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
