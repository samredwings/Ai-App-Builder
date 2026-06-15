export function StreamIndicator() {
  return (
    <div className="mr-auto inline-flex items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-xs text-muted-foreground border border-border/40">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
      </span>
      <span>Rebuilding app spec…</span>
    </div>
  );
}
