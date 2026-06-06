import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCsrf, mutate, request, resetCsrf } from "./api";

describe("frontend api client", () => {
  afterEach(() => {
    resetCsrf();
    vi.unstubAllGlobals();
  });

  it("fetches and caches the CSRF token", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ csrfToken: "csrf-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureCsrf()).resolves.toBe("csrf-token");
    await expect(ensureCsrf()).resolves.toBe("csrf-token");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/csrf",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("adds CSRF and JSON headers for state-changing requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mutate<{ ok: boolean }>("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({ code: "7203" })
      })
    ).resolves.toEqual({ ok: true });

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = requestInit.headers as Headers;
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestInit.credentials).toBe("include");
  });

  it("throws the API error message when a request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "入力値が不正です。" } }, 400)));

    await expect(request("/api/stocks?query=")).rejects.toThrow("入力値が不正です。");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
