/**
 * Critical flow (Fase 2): a school admin uploads a messy weekly-practice file,
 * checks the automatic mapping and preview, saves it; Super Admin then rolls
 * it back so the database returns to its seeded state.
 */
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO = "demo.talentajuara.test";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
// Playwright runs from the project root.
const FILE = path.resolve("docs", "contoh-impor", "latihan-SDTJBDG_berantakan.xlsx");

async function login(browser: Browser, local: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${local}@${DEMO}`);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();
  return page;
}

test.skip(!PASSWORD, "SEED_DEMO_PASSWORD belum diisi di .env.local");

test("admin sekolah mengunggah file latihan berantakan, menyimpan, lalu Super Admin membatalkan", async ({ browser }) => {
  const admin = await login(browser, "admin.sdtjbdg");

  // Upload page: school is fixed for a school admin and a template link is offered.
  await admin.goto("/input/unggah/latihan");
  await expect(admin.getByText("Sekolah:")).toContainText("SD Talenta Juara Bandung");
  const downloadPromise = admin.waitForEvent("download");
  await admin.getByRole("link", { name: /Unduh template latihan pekanan SDTJBDG/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Template_Latihan_Pekanan_SDTJBDG_\d{4}-\d{2}-\d{2}\.xlsx$/);

  await admin.getByLabel("File Excel atau CSV").setInputFiles(FILE);
  await admin.getByRole("button", { name: "Unggah & periksa" }).click();
  await admin.waitForURL(/\/input\/batch\/[0-9a-f-]{36}$/);
  const batchUrl = admin.url();

  // Preview: messy headers mapped automatically, every row ready, nothing saved yet.
  await expect(admin.getByRole("heading", { name: "Pratinjau data" })).toBeVisible();
  await expect(admin.getByText("Draf — belum disimpan")).toBeVisible();
  await expect(admin.getByText(/20 baris data · 20 siap · 0 perlu dicek · 0 bermasalah/)).toBeVisible();
  await admin.getByRole("button", { name: /Pemetaan kolom/ }).click();
  await expect(admin.getByLabel("Kolom No. Induk dibaca sebagai")).toHaveValue("nis");
  await expect(admin.getByLabel("Kolom Jml Soal dibaca sebagai")).toHaveValue("attempted");
  await expect(admin.getByLabel("Kolom Salah dibaca sebagai")).toHaveValue("wrong");
  await expect(admin.getByRole("cell", { name: "Campuran" }).first()).toBeVisible();

  await admin.getByRole("button", { name: "Simpan 20 baris" }).click();
  await expect(admin.getByText("20 baris berhasil disimpan.")).toBeVisible();
  await expect(admin.getByText("Tersimpan", { exact: true })).toBeVisible();
  // School admins cannot roll back.
  await expect(admin.getByRole("button", { name: "Batalkan unggahan ini" })).toHaveCount(0);

  // History lists the upload.
  await admin.goto("/input/riwayat");
  await expect(admin.getByRole("cell", { name: "latihan-SDTJBDG_berantakan.xlsx" }).first()).toBeVisible();

  // Super Admin rolls the upload back.
  const sa = await login(browser, "superadmin");
  await sa.goto(batchUrl);
  await sa.getByRole("button", { name: "Batalkan unggahan ini" }).click();
  await sa.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(sa.getByText("Data dari unggahan ini sudah dibatalkan.")).toBeVisible();
  await expect(sa.getByText("Dibatalkan", { exact: true }).first()).toBeVisible();
});

test("manajemen (viewer) tidak bisa membuka halaman input", async ({ browser }) => {
  const viewer = await login(browser, "manajemen");
  await viewer.goto("/input");
  await expect(viewer).toHaveURL(/\/tidak-diizinkan/);
});
