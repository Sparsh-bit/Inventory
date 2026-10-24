import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCtx, readFile, productExists, settingsExists } = vi.hoisted(() => ({
  loadCtx: vi.fn(),
  readFile: vi.fn(),
  productExists: vi.fn(),
  settingsExists: vi.fn(),
}));

vi.mock("@/server/context", () => ({ loadCtx }));
vi.mock("node:fs/promises", () => ({ readFile }));
vi.mock("@/server/models", () => ({ Product: { exists: productExists }, OrgSettings: { exists: settingsExists } }));
vi.mock("@/env", () => ({ env: { UPLOAD_DIR: "/tmp/stockpilot-test-uploads" } }));

import { GET as getScopedImage } from "@/app/api/org-files/[orgId]/[name]/route";
import { GET as getLegacyImage } from "@/app/api/files/[name]/route";

const current = { orgId: "aaaaaaaaaaaaaaaaaaaaaaaa", userId: "user-a", role: "owner" as const };

describe("tenant-scoped image delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCtx.mockResolvedValue(current);
    readFile.mockResolvedValue(Buffer.from("image"));
    productExists.mockResolvedValue(null);
    settingsExists.mockResolvedValue(null);
  });

  it("rejects signed-out image reads", async () => {
    loadCtx.mockResolvedValue(null);
    const response = await getScopedImage(new Request("http://localhost"), {
      params: Promise.resolve({ orgId: current.orgId, name: "b".repeat(32) + ".png" }),
    });
    expect(response.status).toBe(401);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("does not serve a tenant-scoped image to a different active business", async () => {
    const response = await getScopedImage(new Request("http://localhost"), {
      params: Promise.resolve({ orgId: "c".repeat(24), name: "b".repeat(32) + ".png" }),
    });
    expect(response.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("serves a tenant-scoped image to a member of that business", async () => {
    const response = await getScopedImage(new Request("http://localhost"), {
      params: Promise.resolve({ orgId: current.orgId, name: "b".repeat(32) + ".png" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readFile).toHaveBeenCalledOnce();
  });

  it("does not serve a legacy flat image unless the active tenant references it", async () => {
    const response = await getLegacyImage(new Request("http://localhost"), {
      params: Promise.resolve({ name: "b".repeat(32) + ".png" }),
    });
    expect(response.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("keeps legacy images available to their referencing tenant", async () => {
    productExists.mockResolvedValue({ _id: "product-a" });
    const response = await getLegacyImage(new Request("http://localhost"), {
      params: Promise.resolve({ name: "b".repeat(32) + ".png" }),
    });
    expect(response.status).toBe(200);
    expect(readFile).toHaveBeenCalledOnce();
  });
});
