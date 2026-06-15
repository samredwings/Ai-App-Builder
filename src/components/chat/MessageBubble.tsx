import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown, ChevronRight, FileCode } from "lucide-react";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  isLatest?: boolean;
}

export function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const codeBlocks = message.content.match(/```(\w+)?\n([\s\S]*?)```/g) || [];
  const hasCode = codeBlocks.length > 0;
  const { mainContent, diffContent } = parseChangeLog(message.content);

  return (
    <div
      className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
        isUser
          ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
          : "mr-auto bg-muted/80 rounded-bl-sm border border-border/40"
      } ${isLatest && !isUser ? "ring-1 ring-primary/20" : ""}`}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap">{message.content}</p>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const code = String(children).replace(/\n$/, "");
                const isInline = !match;

                if (isInline) {
                  return (
                    <code
                      className="bg-muted-foreground/10 rounded px-1 py-0.5 text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                const lang = match[1];
                const isFilePath = lang && (lang.includes(".") || lang.includes("/"));

                return (
                  <div className="group relative my-2 rounded-lg overflow-hidden border">
                    {isFilePath && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border-b text-[11px] text-muted-foreground font-mono">
                        <FileCode className="w-3 h-3" />
                        {lang}
                      </div>
                    )}
                    <div className="relative">
                      <SyntaxHighlighter
                        style={oneDark}
                        language={isFilePath ? "typescript" : lang || "typescript"}
                        customStyle={{
                          margin: 0,
                          borderRadius: isFilePath ? "0 0 6px 6px" : "6px",
                          fontSize: "0.75rem",
                          lineHeight: "1.4",
                        }}
                      >
                        {code}
                      </SyntaxHighlighter>
                      <button
                        onClick={() => copyToClipboard(code)}
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                      >
                        {copiedCode === code ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-white/70" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              },
              p({ children }) {
                return <p className="mb-1.5 last:mb-0">{children}</p>;
              },
              ul({ children }) {
                return <ul className="list-disc pl-4 space-y-1 my-1.5">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="list-decimal pl-4 space-y-1 my-1.5">{children}</ol>;
              },
              li({ children }) {
                return <li className="text-sm">{children}</li>;
              },
              strong({ children }) {
                return <strong className="font-semibold">{children}</strong>;
              },
              h3({ children }) {
                return <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>;
              },
              h4({ children }) {
                return (
                  <h4 className="text-xs font-semibold mt-2 mb-0.5 text-muted-foreground uppercase tracking-wider">
                    {children}
                  </h4>
                );
              },
            }}
          >
            {mainContent}
          </ReactMarkdown>

          {diffContent && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDiff ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                What changed
              </button>
              {showDiff && (
                <div className="mt-1.5 text-xs space-y-1">
                  {diffContent.map((diff, i) => (
                    <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
                      <span className={diff.type === "add" ? "text-green-600" : "text-red-600"}>
                        {diff.type === "add" ? "+" : "-"}
                      </span>
                      <span className={diff.type === "add" ? "text-green-700" : "text-red-700"}>
                        {diff.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasCode && (
            <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-border/20">
              {extractFileNames(message.content).map((fname) => (
                <span
                  key={fname}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted-foreground/10 text-[10px] font-mono text-muted-foreground"
                >
                  <FileCode className="w-2.5 h-2.5" />
                  {fname}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`mt-1 text-[10px] ${isUser ? "text-primary-foreground/60" : "text-muted-foreground/50"}`}>
        {formatTime(message.created_at)}
      </div>
    </div>
  );
}

function parseChangeLog(content: string): {
  mainContent: string;
  diffContent: Array<{ type: "add" | "remove"; text: string }> | null;
} {
  const diffMarker = /(?:##\s*(?:Changes|What changed|Diff)|###\s*(?:Changes|Diff))/i;
  const parts = content.split(diffMarker);
  if (parts.length < 2) return { mainContent: content, diffContent: null };

  const mainContent = parts[0].trim();
  const diffSection = parts.slice(1).join(" ");
  const lines = diffSection.split("\n").filter(Boolean);
  const diffs: Array<{ type: "add" | "remove"; text: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) {
      diffs.push({ type: "add", text: trimmed.slice(1).trim() });
    } else if (trimmed.startsWith("-") && !trimmed.startsWith("---")) {
      diffs.push({ type: "remove", text: trimmed.slice(1).trim() });
    }
  }

  return { mainContent, diffContent: diffs.length > 0 ? diffs : null };
}

function extractFileNames(content: string): string[] {
  const files: string[] = [];
  const codeBlockRegex = /```(\S+(?:\/\S+)?(?:\.[a-z]+))\n/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const candidate = match[1];
    if (candidate.includes(".") || candidate.includes("/")) {
      files.push(candidate);
    }
  }
  return [...new Set(files)].slice(0, 5);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
