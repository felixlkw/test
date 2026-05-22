import { test, expect } from "@playwright/test";

// Smoke — catalog API returns Hoban-only domains and Hoban work_types.
// Endpoint /api/work-types?domain=X returns JSON array (not wrapped).
// Verifies the domain-cleanup (heavy_industry/semiconductor hidden,
// manufacturing labeled '케이블 제조', construction has Hoban + 대한전선 EPC).

async function fetchWorkTypeIds(request: any, domain: string): Promise<string[]> {
  const res = await request.get(`/api/work-types?domain=${domain}`);
  expect(res.status(), `GET /api/work-types?domain=${domain}`).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body), `body for ${domain}`).toBe(true);
  return body.map((w: { id: string }) => w.id);
}

test.describe("smoke / catalog API", () => {
  test("construction catalog: hoban + 대한전선 work_types present", async ({ request }) => {
    const ids = await fetchWorkTypeIds(request, "construction");
    const expected = [
      "APT_RC_BUILD",
      "APT_GANG_FORM",
      "URBAN_DEV_EARTHWORK",
      "CABLE_UNDERGROUND_PULLING",
      "SUBSTATION_CONSTRUCTION",
    ];
    for (const id of expected) {
      expect(ids, `expected ${id} in construction catalog`).toContain(id);
    }
    // LG cleanroom work_types should be gone.
    const removed = ["CLEANROOM_FITOUT", "FAB_BUILDING_EXTENSION", "EQUIPMENT_RIGGING"];
    for (const id of removed) {
      expect(ids, `should NOT contain ${id}`).not.toContain(id);
    }
  });

  test("manufacturing catalog: 대한전선 cable manufacturing work_types", async ({ request }) => {
    const ids = await fetchWorkTypeIds(request, "manufacturing");
    const expected = ["COPPER_ROD_CASTING", "XLPE_EXTRUSION", "DRUM_WINDING", "HV_TEST_LAB"];
    for (const id of expected) {
      expect(ids, `expected ${id} in manufacturing catalog`).toContain(id);
    }
  });

  test("heavy_industry catalog is empty (hidden for Hoban)", async ({ request }) => {
    const ids = await fetchWorkTypeIds(request, "heavy_industry");
    expect(ids.length).toBe(0);
  });

  test("semiconductor catalog is empty (hidden for Hoban)", async ({ request }) => {
    const ids = await fetchWorkTypeIds(request, "semiconductor");
    expect(ids.length).toBe(0);
  });
});
