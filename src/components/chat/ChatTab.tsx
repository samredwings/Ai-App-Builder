import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "./MessageBubble";
import { StreamIndicator } from "./StreamIndicator";
import type { Message } from "@/lib/types";

interface ChatTabProps {
  messages: Message[];
  isPending: boolean;
  onSend: (msg: string) => void;
}

export function ChatTab({ messages, isPending, onSend }: ChatTabProps) {
  const [chatInput, setChatInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  const handleSend = () => {
    const msg = chatInput.trim();
    if (!msg || isPending) return;
    onSend(msg);
    setChatInput("");
  };

  const placeholderMessages: Message[] = [
    {
      id: "placeholder",
      role: "assistant",
      content: `**Co-builder Chat**

Describe changes or paste code. Examples:

- "Add an entries log and persist it with appStorage"
- "Create a beautiful dashboard tab for tracking goals"
- "Make a clean, modern catalog tab for our items"

You can also paste entire component files and I'll integrate them.`,
      created_at: new Date().toISOString(),
    },
  ];

  const displayMessages = messages.length === 0 ? placeholderMessages : messages;

  return (
    <div className="flex-1 flex flex-col min-h-0 mt-3 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border bg-background/50 min-h-0"
      >
        <div className="p-3 space-y-2.5">
          {displayMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLatest={idx === displayMessages.length - 1 && isPending}
            />
          ))}
          {isPending && (
            <div className="pr-2">
              <StreamIndicator />
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 shrink-0 space-y-2">
        <Textarea
          rows={3}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Paste code or type development instructions here..."
          className="resize-none text-sm font-sans min-h-[60px]"
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          className="w-full"
          disabled={isPending || chatInput.trim().length < 1}
          onClick={handleSend}
        >
          {isPending ? "Refining App..." : "Refine App"}
        </Button>
      </div>
    </div>
  );
}
