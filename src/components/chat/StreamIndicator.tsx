import { useState, useEffect } from "react";

const STAGES = [
  "Analyzing your request…",
  "Consulting the app spec…",
  "Generating component code…",
  "Updating project structure…",
  "Refining UI…",
];

export function StreamIndicator() {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 2500);

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 92));
    }, 600);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="max-w-[92%] mr-auto bg-muted/80 border border-border/40 rounded-xl p-3 space-y-2">
      <div className="w-full h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex space-x-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <span>{STAGES[stage]}</span>
      </div>
    </div>
  );
}
