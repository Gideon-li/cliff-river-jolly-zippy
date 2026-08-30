import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  kind: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  juLabel: string | null;
  hourName: string | null;
  scan: unknown;
  messages: ChatMessage[];
};

export function ConsultChat({
  session,
  busy,
  error,
  onSend,
}: {
  session: ChatSession;
  busy: boolean;
  error?: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages.length, busy]);

  return (
    <div className="flex flex-col">
      {session.juLabel ? (
        <p className="mb-3 text-xs text-faint">
          {session.juLabel}
          {session.hourName ? ` · ${session.hourName.replace(/时$/, "")}时` : ""}
        </p>
      ) : null}

      <div className="space-y-3 pb-44">
        {session.messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[92%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-cinnabar text-paper"
                : "border border-line bg-paper-2 text-ink",
            )}
          >
            {m.content}
          </div>
        ))}
        {busy ? <p className="text-xs text-faint">我在想，稍等一会儿…</p> : null}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-24 z-10 mt-4 flex gap-2 rounded-[var(--radius-xl)] border border-line bg-paper-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (!q || busy) return;
          setText("");
          onSend(q);
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="想问什么，直接说就好"
          className="border-0 bg-transparent focus:ring-0"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="发送">
          <ArrowUp className="size-4" />
        </Button>
      </form>
      {error ? <p className="mt-2 text-xs text-cinnabar">{error}</p> : null}
    </div>
  );
}
