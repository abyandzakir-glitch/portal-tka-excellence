/**
 * TKA dashboard smoke flow (Fase 3): pages render with seed data for the
 * right roles, filters live in the URL, heatmap drill-down works.
 * Read-only: nothing is written.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO = "demo.talentajuara.test";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

async function login(browser: Browser, local: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${local}@${DEMO}`);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();
  return page;
}

test.skip(!PASSWORD, "SEED_DEMO_PASSWORD belum diisi di .env.local");

test("manajemen melihat ringkasan jaringan dan bisa menelusuri heatmap", async ({ browser }) => {
  const page = await login(browser, "manajemen");
  await page.goto("/tka");
  await expect(page.getByRole("heading", { name: "TKA Dashboard" })).toBeVisible();
  await expect(page.getByText("Rata-rata nilai TO terakhir · Matematika")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tren rata-rata nilai TO per sekolah/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Penguasaan kompetensi per sekolah/ })).toBeVisible();
  await page.screenshot({ path: "test-results/tka-ringkasan.png", fullPage: true });

  // Filters are kept in the URL.
  await page.getByRole("radio", { name: "Bahasa Indonesia" }).click();
  await expect(page).toHaveURL(/mapel=BIN/);
  await expect(page.getByText("Rata-rata nilai TO terakhir · Bahasa Indonesia")).toBeVisible();

  // Heatmap cell -> weakest students for that competency and school.
  await page.locator('table a[href^="/tka/kompetensi/"]').first().click();
  await expect(page).toHaveURL(/\/tka\/kompetensi\/.+sekolah=/);
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({ path: "test-results/tka-kompetensi.png", fullPage: true });
});
