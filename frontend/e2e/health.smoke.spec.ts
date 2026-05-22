import { test, expect, request } from "@playwright/test";

// Smoke — backend liveness + brand identity sanity.
// Runs against deployed Railway URL by default. Fast (<5s). Run on every CI.

test.describe("smoke / backend health", () => {
  test("/api/health returns ok + version", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBeTruthy();
  });

  test("/api/webrtc-key issues ephemeral key for korean construction", async ({ request }) => {
    const res = await request.post("/api/webrtc-key", {
      data: { language: "korean", domain: "construction" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.key).toBeTruthy();
    expect(body.key).toMatch(/^ek_/);
  });

  test("/api/webrtc-key works for all 5 languages × construction", async ({ request }) => {
    for (const language of ["korean", "english", "vietnamese", "thai", "indonesian"]) {
      const res = await request.post("/api/webrtc-key", {
        data: { language, domain: "construction" },
      });
      expect(res.status(), `language=${language}`).toBe(200);
      const body = await res.json();
      expect(body.key, `language=${language}`).toMatch(/^ek_/);
    }
  });

  // 회귀 보강 (2026-05-23) — EHS 모드는 ['audio','text'] 콤보를 시도하다가 GA API 가
  // ['audio'] OR ['text'] 만 허용하도록 변경되어 400 으로 실패. 이 테스트가 두 모드
  // 모두 200 OK 를 보장.
  test("/api/webrtc-key supports both TBM and EHS modes", async ({ request }) => {
    for (const mode of ["tbm", "ehs"]) {
      const res = await request.post("/api/webrtc-key", {
        data: { language: "korean", domain: "construction", mode },
      });
      expect(res.status(), `mode=${mode}`).toBe(200);
      const body = await res.json();
      expect(body.key, `mode=${mode}`).toMatch(/^ek_/);
    }
  });
});

test.describe("smoke / SPA brand identity", () => {
  test("HTML title carries Hoban branding (not LG/Safety Vision)", async ({ page }) => {
    await page.goto("/static/");
    await expect(page).toHaveTitle(/호반|Hoban/);
    const title = await page.title();
    expect(title).not.toMatch(/Safety Vision|LG/);
  });

  test("HomeScreen renders Hoban brand bar with appName", async ({ page }) => {
    await page.goto("/static/");
    await page.waitForLoadState("networkidle");
    // brand bar wordmark text (SPA mounted)
    await expect(page.getByText(/호반 세이프/).first()).toBeVisible({ timeout: 15_000 });
    // No leftover LG/PwC references on first screen
    await expect(page.getByText(/Safety Vision/)).toHaveCount(0);
    await expect(page.getByText(/LG Innotek/)).toHaveCount(0);
  });

  test("hoban-logo.svg is fetched (not LG/PwC logos)", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "image") requests.push(r.url());
    });
    await page.goto("/static/");
    await page.waitForLoadState("networkidle");
    expect(requests.some((u) => u.includes("hoban-logo.svg"))).toBe(true);
    expect(requests.some((u) => /LG_Innotek|pwc-logo|PwC_Company/i.test(u))).toBe(false);
  });
});

test.describe("smoke / static assets", () => {
  test("hoban-logo.svg accessible as SVG content", async ({ request }) => {
    const res = await request.get("/hoban-logo.svg");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("svg");
  });

  test("LG / PwC logos no longer served (SPA fallback returns HTML instead)", async ({ request }) => {
    // FastAPI SPA fallback returns 200 + text/html for any unknown path.
    // The real assertion: content-type is NOT image/svg+xml (i.e. asset is gone).
    for (const path of ["/pwc-logo.svg", "/LG_Innotek_logo_(english).svg", "/PwC_Company_Logo.svg.png"]) {
      const res = await request.get(path);
      const ct = res.headers()["content-type"] ?? "";
      expect(ct, `path=${path} content-type=${ct}`).not.toContain("svg");
      expect(ct, `path=${path} content-type=${ct}`).not.toContain("image");
    }
  });
});
