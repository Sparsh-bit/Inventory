/** Parse multipart data while enforcing a byte cap even if Content-Length is absent. */
export async function readLimitedForm(request: Request, maxBytes: number, onTooLarge: () => void): Promise<FormData> {
  if (!request.body) throw new Error("Missing request body");
  const reader = request.body.getReader();
  let size = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      size += value.byteLength;
      if (size > maxBytes) {
        onTooLarge();
        await reader.cancel();
        controller.error(new RangeError("Upload is too large"));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const limitedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    duplex: "half",
  } as RequestInit);
  return limitedRequest.formData();
}
