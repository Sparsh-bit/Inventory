import { loadCtx } from "@/server/context";
import { readScans } from "@/server/services/scan";

// ponytail: 500ms polling per open pairing; switch to change streams if pairings reach the hundreds.
export async function GET(req: Request, { params }: RouteContext<"/api/scan/[token]/stream">) {
  const ctx = await loadCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { token } = await params;
  const initial = await readScans(ctx, token);
  if (!initial) return new Response("Gone", { status: 410 });

  const enc = new TextEncoder();
  let seq = initial.seq;
  let timer: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { seq });
      const close = () => {
        clearInterval(timer);
        clearInterval(beat);
        try {
          controller.close();
        } catch {}
      };
      timer = setInterval(async () => {
        try {
          const s = await readScans(ctx, token);
          if (!s) {
            send("expired", {});
            return close();
          }
          if (s.seq > seq) {
            const fresh = s.events.slice(-(s.seq - seq));
            seq = s.seq;
            for (const e of fresh) send("scan", { code: e.code });
          }
        } catch {
          close();
        }
      }, 500);
      beat = setInterval(() => controller.enqueue(enc.encode(": keep-alive\n\n")), 15_000);
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(beat);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
