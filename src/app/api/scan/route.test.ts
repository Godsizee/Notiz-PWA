import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// authRefresh pro Test steuerbar; alles andere der Route laeuft echt.
const authRefresh = vi.fn();
vi.mock("pocketbase", () => ({
  default: class {
    authStore = { save: () => {} };
    collection = () => ({ authRefresh });
  },
}));

async function post(token: string | null) {
  vi.stubEnv("POCKETBASE_URL", "https://pb.example.test");
  vi.stubEnv("N8N_SCAN_WEBHOOK_URL", "https://n8n.example.test/webhook");
  vi.stubEnv("N8N_SCAN_WEBHOOK_KEY", "key");
  vi.resetModules();
  const { POST } = await import("./route");
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "zettel.png");
  const request = new Request("https://app.example.test/api/scan", {
    method: "POST",
    headers: token ? { Authorization: token } : {},
    body: form,
  });
  const res = await POST(request);
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string } };
}

describe("POST /api/scan: Sitzungspruefung", () => {
  beforeEach(() => {
    authRefresh.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("ohne Token: 401, PocketBase wird nicht gefragt", async () => {
    const { status, body } = await post(null);
    expect(status).toBe(401);
    expect(body.error).toBe("unauthenticated");
    expect(authRefresh).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])("PocketBase lehnt das Token ab (%i): 401", async (code) => {
    authRefresh.mockRejectedValue({ status: code, message: "abgelehnt" });
    const { status, body } = await post("token");
    expect(status).toBe(401);
    expect(body.error).toBe("unauthenticated");
  });

  it("PocketBase nicht erreichbar (Status 0): 503 statt 'Sitzung abgelaufen', Ursache im Log", async () => {
    authRefresh.mockRejectedValue({
      status: 0,
      message: "Something went wrong while processing your request.",
      originalError: { message: "fetch failed", cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" } },
    });
    const { status, body } = await post("token");
    expect(status).toBe(503);
    expect(body.error).toBe("scan_unavailable");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("https://pb.example.test");
    expect(logged).toContain("UND_ERR_CONNECT_TIMEOUT");
  });

  it("PocketBase antwortet mit 500: ebenfalls 503", async () => {
    authRefresh.mockRejectedValue({ status: 500, message: "kaputt" });
    const { status } = await post("token");
    expect(status).toBe(503);
  });
});
