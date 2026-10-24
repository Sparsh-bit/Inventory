import { describe, expect, it } from "vitest";
import { readLimitedForm } from "@/lib/limited-form-data";

describe("multipart request size cap", () => {
  it("rejects an oversized streaming body even when Content-Length is omitted", async () => {
    let tooLarge = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(128));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=test-boundary" },
      body,
      duplex: "half",
    } as RequestInit);

    await expect(readLimitedForm(request, 64, () => { tooLarge = true; })).rejects.toThrow();
    expect(tooLarge).toBe(true);
  });

  it("preserves a valid multipart body within the cap", async () => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "tiny.png", { type: "image/png" }));
    const request = new Request("http://localhost/api/uploads", { method: "POST", body: form });
    const parsed = await readLimitedForm(request, 1024, () => { throw new Error("unexpected size rejection"); });
    expect(parsed.get("kind")).toBe("image");
    expect((parsed.get("file") as File).size).toBe(3);
  });
});
