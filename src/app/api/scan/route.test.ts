import http from "node:http";
import type { AddressInfo } from "node:net";
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

// POCKETBASE_CONNECT_VIA: Verbindung zu einem anderen Host, Host-Header bleibt der echte Name.
describe("POST /api/scan: POCKETBASE_CONNECT_VIA", () => {
  let server: http.Server;
  let port: number;
  let answer: { status: number; body: string };
  let seen: { host?: string; authorization?: string; method?: string; url?: string };

  beforeEach(async () => {
    authRefresh.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer = { status: 200, body: JSON.stringify({ token: "neu", record: { id: "user1" } }) };
    seen = {};
    server = http.createServer((req, res) => {
      seen = { host: req.headers.host, authorization: req.headers.authorization, method: req.method, url: req.url };
      res.writeHead(answer.status, { "Content-Type": "application/json" }).end(answer.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function postVia(pbUrl: string, via: string) {
    vi.stubEnv("POCKETBASE_URL", pbUrl);
    vi.stubEnv("POCKETBASE_CONNECT_VIA", via);
    vi.stubEnv("N8N_SCAN_WEBHOOK_URL", "http://127.0.0.1:9/webhook");
    vi.stubEnv("N8N_SCAN_WEBHOOK_KEY", "key");
    vi.resetModules();
    const { POST } = await import("./route");
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "zettel.png");
    const res = await POST(new Request("https://app.example.test/api/scan", { method: "POST", headers: { Authorization: "tok" }, body: form }));
    return { status: res.status, body: (await res.json()) as { error?: string } };
  }

  it("verbindet sich mit `via`, schickt aber den echten Host und das Token; PocketBase-SDK bleibt unbenutzt", async () => {
    const { status } = await postVia(`http://pb.example.test:${port}`, "127.0.0.1");
    expect(seen).toMatchObject({ host: `pb.example.test:${port}`, authorization: "tok", method: "POST", url: "/api/collections/users/auth-refresh" });
    expect(authRefresh).not.toHaveBeenCalled();
    expect(status).not.toBe(401); // Sitzung gilt; danach scheitert erst der (unerreichbare) Webhook
  });

  it("PocketBase lehnt das Token ab (401): Sitzung abgelaufen", async () => {
    answer = { status: 401, body: "{}" };
    const { status, body } = await postVia(`http://pb.example.test:${port}`, "127.0.0.1");
    expect(status).toBe(401);
    expect(body.error).toBe("unauthenticated");
  });

  it("`via` nicht erreichbar: 503, Ursache im Log", async () => {
    await new Promise((resolve) => server.close(resolve));
    server = http.createServer();
    const { status, body } = await postVia(`http://pb.example.test:${port}`, "127.0.0.1");
    expect(status).toBe(503);
    expect(body.error).toBe("scan_unavailable");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("ECONNREFUSED");
  });
});
