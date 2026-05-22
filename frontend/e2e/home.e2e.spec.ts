import { test, expect } from "@playwright/test";

// E2E — HomeScreen → domain sheet → PrepareScreen navigation (mobile viewport).
// No microphone/voice (would need WebRTC). Verifies brand + domain options +
// PrepareScreen "직접 입력" path.

test.describe("home navigation (mobile)", () => {
  test("HomeScreen shows Hoban brand + new TBM button", async ({ page }) => {
    await page.goto("/static/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("호반 세이프").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /새 TBM 시작/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /EHS 안전 질문/ })).toBeVisible();
  });

  test("domain sheet shows only construction + 케이블 제조 (hidden domains filtered)", async ({ page }) => {
    await page.goto("/static/");
    await page.getByRole("button", { name: /새 TBM 시작/ }).click();
    // Wait for domain sheet
    await expect(page.getByText(/건설/).first()).toBeVisible();
    await expect(page.getByText(/케이블 제조/)).toBeVisible();
    // Hidden domains should not appear in the sheet
    await expect(page.getByText(/중공업/)).toHaveCount(0);
    await expect(page.getByText(/반도체/)).toHaveCount(0);
  });

  test("PrepareScreen exposes both catalog and free-form direct input", async ({ page }) => {
    await page.goto("/static/");
    await page.getByRole("button", { name: /새 TBM 시작/ }).click();
    // Pick 건설
    await page.getByText(/건설/).first().click();
    // Should land on PrepareScreen
    await expect(page.getByText(/작업 선택/)).toBeVisible({ timeout: 15_000 });
    // Free-form custom-work input present
    await expect(page.getByText(/또는 직접 입력/)).toBeVisible();
    await expect(page.getByPlaceholder(/호반써밋/)).toBeVisible();
    // Filling custom title should enable TBM 시작
    const start = page.getByRole("button", { name: /TBM 시작/ });
    await expect(start).toBeDisabled();
    await page.getByPlaceholder(/호반써밋/).fill("호반써밋 E2E 갱폼 인양");
    await expect(start).toBeEnabled();
    // Selecting a catalog item should clear the custom title (mutual exclusive)
    const catalogItem = page.getByRole("button", { name: /갱폼/ }).first();
    if (await catalogItem.count() > 0) {
      await catalogItem.click();
      await expect(page.getByPlaceholder(/호반써밋/)).toHaveValue("");
    }
  });
});
