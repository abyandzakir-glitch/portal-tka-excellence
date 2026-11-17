/**
 * Fase 5 smoke flow, read-only (nothing is submitted):
 * Pusat Input Pekanan for management and school admin, user management and
 * master data pages for Super Admin.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO = "demo.talentajuara.test";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

async function login(browser: Browser, local: string, width = 1440): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${local}@${DEMO}`);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();
  return page;
}

test.skip(!PASSWORD, "SEED_DEMO_PASSWORD belum diisi di .env.local");

test("manajemen melihat status input kelima sekolah tanpa tombol unggah", async ({ browser }) => {
  const page = await login(browser, "manajemen");
  await page.goto("/input");
  await expect(page.getByRole("heading", { name: /Status input pekan ini/ })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Unggah data baru" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/pusat-input-manajemen.png", fullPage: true });

  await page.getByRole("link", { name: "← Pekan sebelumnya" }).click();
  await expect(page).toHaveURL(/pekan=2026-11-09/);
  await expect(page.getByRole("heading", { name: /Status input pekan/ })).toBeVisible();
});

test("admin sekolah melihat status sekolahnya dan bagian unggah", async ({ browser }) => {
  const page = await login(browser, "admin.sdtjbdg", 390);
  await page.goto("/input");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SD Talenta Juara Bandung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unggah data baru" })).toBeVisible();
  await page.screenshot({ path: "test-results/pusat-input-admin-ponsel.png", fullPage: true });
});

test("super admin membuka pengguna, kelola akun, dan ubah siswa", async ({ browser }) => {
  const page = await login(browser, "superadmin");
  await page.goto("/pengguna");
  await expect(page.getByRole("heading", { name: "Undang pengguna" })).toBeVisible();
  await expect(page.getByRole("cell", { name: `admin.sdtjbdg@${DEMO}` })).toBeVisible();
  // School field appears only for Admin Sekolah.
  await expect(page.getByLabel("Sekolah")).toHaveCount(0);
  await page.getByLabel("Peran").selectOption("school_admin");
  await expect(page.getByLabel("Sekolah")).toBeVisible();
  await page.screenshot({ path: "test-results/pengguna.png", fullPage: true });

  await page.getByRole("link", { name: /^Kelola .*/ }).first().click();
  await expect(page.getByRole("heading", { name: "Nama, peran, dan sekolah" })).toBeVisible();
  await page.screenshot({ path: "test-results/pengguna-kelola.png", fullPage: true });

  await page.goto("/master/siswa");
  await expect(page.getByRole("link", { name: /Impor data siswa/ })).toBeVisible();
  await page.getByRole("link", { name: /^Ubah data / }).first().click();
  await expect(page.getByLabel("Nama lengkap")).toBeVisible();
  await expect(page.getByLabel(/Kelas/)).toBeVisible();
  await page.screenshot({ path: "test-results/siswa-ubah.png", fullPage: true });

  await page.goto("/master/kompetensi");
  await expect(page.getByText(/Tambah sub-kompetensi di/).first()).toBeVisible();
});
