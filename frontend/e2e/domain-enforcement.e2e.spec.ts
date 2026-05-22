import { test, expect } from "@playwright/test";

// E2E (mobile) — Phase 0.6 Wave 4 catalog enforcement.
// Manufacturing (케이블 제조) blocks free-form direct input; construction allows it.

test.describe("domain enforcement (mobile)", () => {
  test("manufacturing domain: PrepareScreen blocks free-form 직접 입력", async ({ page }) => {
    await page.goto("/static/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /새 TBM 시작/ }).click();
    // Pick 케이블 제조 (manufacturing)
    await page.getByText(/케이블 제조/).first().click();
    // Should land on PrepareScreen
    await expect(page.getByText(/작업 선택/)).toBeVisible({ timeout: 15_000 });
    // 직접 입력 input should NOT be present; explanation message instead.
    await expect(page.getByPlaceholder(/호반써밋/)).toHaveCount(0);
    await expect(
      page.getByText(/정형 SOP 의존성이 높아 카탈로그 선택만 허용/),
    ).toBeVisible();
  });

  test("construction domain: PrepareScreen still allows free-form 직접 입력", async ({ page }) => {
    await page.goto("/static/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /새 TBM 시작/ }).click();
    await page.getByText(/건설/).first().click();
    await expect(page.getByText(/작업 선택/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/호반써밋/)).toBeVisible();
  });
});
