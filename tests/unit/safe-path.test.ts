import { expect, test } from "vitest";
import { safePath } from "@/lib/safe-path";

test("keeps normal in-app paths", () => {
  expect(safePath("/dashboard")).toBe("/dashboard");
  expect(safePath("/accept-invite/abc?x=1#y")).toBe("/accept-invite/abc?x=1#y");
});

test("refuses anything that can leave the site", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "/\tevil.com", "/%09/evil.com".replace("%09", "\t"), "https://evil.com", "evil.com", "", "/\u0000x", 42, null]) {
    expect(safePath(bad), String(bad)).toBeNull();
  }
});
