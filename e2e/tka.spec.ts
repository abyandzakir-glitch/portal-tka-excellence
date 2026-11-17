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

test("admin sekolah diarahkan ke sekolahnya; profil siswa, kelompok intervensi, perbandingan TO", async ({ browser }) => {
  const page = await login(browser, "admin.sdtjbdg");
  await page.goto("/tka");
  await expect(page).toHaveURL(/\/tka\/sekolah\/SDTJBDG/);
  await expect(page.getByRole("heading", { name: "SD Talenta Juara Bandung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daftar siswa" })).toBeVisible();
  // School switcher is not offered to a school admin.
  await expect(page.getByLabel("Sekolah", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/tka-sekolah.png", fullPage: true });

  // Student table: filter, then open a profile.
  await page.getByLabel("Status").selectOption("berisiko");
  await page.locator('table a[href^="/tka/siswa/"]').first().click();
  await expect(page.getByRole("heading", { name: "Rekomendasi fokus intervensi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Catatan intervensi" })).toBeVisible();
  await page.screenshot({ path: "test-results/tka-siswa.png", fullPage: true });

  // Another school's dashboard is not reachable.
  await page.goto("/tka/sekolah/SMPTJPKU");
  await expect(page).toHaveURL(/\/tka\/sekolah\/SDTJBDG/);

  await page.goto("/tka/intervensi");
  await expect(page.getByRole("heading", { name: "Kelompok Intervensi" })).toBeVisible();
  await page.screenshot({ path: "test-results/tka-intervensi.png", fullPage: true });
  for (const fmt of ["Excel", "PDF"]) {
    const dl = page.waitForEvent("download");
    await page.getByRole("link", { name: fmt }).click();
    expect((await dl).suggestedFilename()).toMatch(new RegExp(`^Kelompok_Intervensi_SDTJBDG_MAT\\.${fmt === "PDF" ? "pdf" : "xlsx"}$`));
  }

  await page.goto("/tka/bandingkan");
  const options = page.getByLabel("Try out awal").locator("option");
  const a = await options.filter({ hasText: "TO 3 Matematika SD" }).getAttribute("value");
  const b = await options.filter({ hasText: "TO 4 Matematika SD" }).getAttribute("value");
  await page.goto(`/tka/bandingkan?a=${a}&b=${b}`);
  await expect(page.getByRole("heading", { name: "Paling meningkat" })).toBeVisible();
  await page.screenshot({ path: "test-results/tka-bandingkan.png", fullPage: true });
});

test("Super Admin membuka Pengaturan; manajemen tidak", async ({ browser }) => {
  const sa = await login(browser, "superadmin");
  await sa.goto("/pengaturan");
  await expect(sa.getByLabel("Cakap mulai")).toHaveValue("70");
  await expect(sa.getByText("Latihan pekanan otomatis 30%.")).toBeVisible();
  await sa.screenshot({ path: "test-results/pengaturan.png", fullPage: true });

  const viewer = await login(browser, "manajemen");
  await viewer.goto("/pengaturan");
  await expect(viewer).toHaveURL(/\/tidak-diizinkan/);
});
