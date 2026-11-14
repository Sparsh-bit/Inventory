"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { askGalla } from "@/server/actions/ai";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

type Msg = { role: "user" | "assistant"; content: string };
const IDEAS = ["How much did I sell today?", "What is running low?", "Who owes me money?", "How do I add a product from a menu photo?"];

/** "Ask Galla": a chat panel that answers from the shop's own numbers and explains how to do things. */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await askGalla({ messages: next.slice(-12) });
      setMsgs([...next, { role: "assistant", content: r.ok ? r.data.reply : r.error }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "I could not reach the server. Check the internet and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Ask Galla, the assistant" className="gap-1.5">
        <Sparkles className="size-4 text-primary" /> <span className="hidden sm:inline">Ask Galla</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Ask Galla</SheetTitle>
            <SheetDescription>Ask about today&apos;s sales, stock, who owes you, or how to do something. It only reads; it never changes anything.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Try asking:</p>
                {IDEAS.map((i) => <Button key={i} type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void send(i)}>{i}</Button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground" : "mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"}>{m.content}</div>
            ))}
            {busy && <div className="mr-8 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground"><Spinner /> Thinking…</div>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask in English, Hindi or Hinglish" maxLength={2000} aria-label="Your question" className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Button type="submit" size="icon" className="size-10" disabled={busy || !text.trim()} aria-label="Send"><Send /></Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
