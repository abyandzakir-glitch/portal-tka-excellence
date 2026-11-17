/**
 * Fase 4 acceptance (CLAUDE.md §11): three achievement files in different
 * formats — neat (standard template), messy (school recap) and pasted text —
 * are normalised correctly after confirmation. Plus: cumulative re-upload adds
 * nothing, dashboard + exports, manual input. Steps run in order; afterAll
 * always rolls the uploads back as Super Admin so the seed stays intact.
 */
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO = "demo.talentajuara.test";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const EX = (f: string) => path.resolve("docs", "contoh-impor", f);

async function login(browser: Browser, local: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${local}@${DEMO}`);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();
  return page;
}

async function uploadAndSave(page: Page, source: { file?: string; text?: string }, expectSummary: RegExp): Promise<string> {
  await page.goto("/input/unggah/prestasi");
  if (source.file) await page.getByLabel("File rekap").setInputFiles(source.file);
  if (source.text) await page.getByLabel("…atau tempel teks rekap").fill(source.text);
  await page.getByRole("button", { name: "Unggah & periksa" }).click();
  await page.waitForURL(/\/input\/batch\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByText(expectSummary)).toBeVisible();
  const ack = page.getByRole("checkbox", { name: /Saya sudah memeriksa/ });
  if (await ack.count()) await ack.check();
  await page.getByRole("button", { name: /^Simpan \d+ baris$/ }).click();
  await expect(page.getByText(/baris berhasil disimpan/)).toBeVisible();
  return url;
}

test.skip(!PASSWORD, "SEED_DEMO_PASSWORD belum diisi di .env.local");
test.describe.configure({ mode: "serial" });

const saved: string[] = [];
let admin: Page;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  admin = await login(browser, "admin.sdtjbdg");
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(400_000);
  if (!saved.length) return;
  const sa = await login(browser, "superadmin");
  for (const url of saved) {
    await sa.goto(url);
    const rollback = sa.getByRole("button", { name: "Batalkan unggahan ini" });
    if (!(await rollback.count())) continue;
    await rollback.click();
    await sa.getByRole("button", { name: "Ya, batalkan" }).click();
    await expect(sa.getByText("Data dari unggahan ini sudah dibatalkan.")).toBeVisible();
  }
});

test("tiga format: template rapi, rekap berantakan, teks tempel", async () => {
  test.setTimeout(420_000);
  // AI is off by default: the form says so; Excel/CSV and table-shaped text still work.
  await admin.goto("/input/unggah/prestasi");
  await expect(admin.getByText(/Fitur AI sedang nonaktif/)).toBeVisible();

  saved.push(await uploadAndSave(admin, { file: EX("prestasi-SDTJBDG_template.xlsx") }, /3 baris data · 3 siap/));
  saved.push(await uploadAndSave(admin, { file: EX("prestasi-SDTJBDG_berantakan.xlsx") }, /4 baris data · 2 siap · 2 perlu dicek · 0 bermasalah/));
  await expect(admin.getByRole("cell", { name: /Hasil asli: Medali Partisipasi/ })).toBeVisible();
  const pasted = [
    "Tanggal\tNama Siswa\tNama Lomba\tTingkat\tJuara",
    "2026-11-09\tNama Tempel Satu\tLomba Pidato Contoh\tKota Bandung\tJuara 3",
    "10/11/2026\tNama Tempel Dua, Nama Tempel Tiga\tLomba Robotik Contoh\tNasional\tFinalis",
  ].join("\n");
  saved.push(await uploadAndSave(admin, { text: pasted }, /2 baris data · 0 siap · 2 perlu dicek/));
});

test("unggah ulang rekap yang sama tidak membuat data ganda", async () => {
  test.setTimeout(240_000);
  await admin.goto("/input/unggah/prestasi");
  await admin.getByLabel("File rekap").setInputFiles(EX("prestasi-SDTJBDG_template.xlsx"));
  await admin.getByRole("button", { name: "Unggah & periksa" }).click();
  await admin.waitForURL(/\/input\/batch\//);
  await expect(admin.getByText(/Semua 3 prestasi di file ini sudah tersimpan sebelumnya/)).toBeVisible();
  await admin.getByRole("button", { name: "Hapus draf" }).click();
  await admin.getByRole("button", { name: "Hapus draf" }).last().click();
  await admin.waitForURL(/\/input$/);
});

test("dashboard prestasi sekolah dan ekspor Excel/PDF", async () => {
  test.setTimeout(360_000);
  await admin.goto("/prestasi?periode=rentang&dari=2026-10-01&sampai=2026-11-17");
  await expect(admin.getByText("Siswa berprestasi (unik)")).toBeVisible();
  await expect(admin.getByLabel("Sekolah", { exact: true })).toHaveCount(0);
  await admin.screenshot({ path: "test-results/prestasi-dashboard.png", fullPage: true });
  for (const fmt of ["xlsx", "pdf"]) {
    const r = await admin.request.get(`/prestasi/ekspor?periode=rentang&dari=2026-10-01&sampai=2026-11-17&format=${fmt}`, { timeout: 240_000 });
    expect(r.status()).toBe(200);
    expect(r.headers()["content-disposition"]).toMatch(new RegExp(`Rekap_Prestasi_SDTJBDG_.+\\.${fmt}`));
  }
});

test("input manual satu prestasi, lalu dihapus", async () => {
  test.setTimeout(300_000);
  await admin.goto("/prestasi/tambah");
  await admin.getByLabel("Tanggal prestasi").fill("2026-11-12");
  await admin.getByLabel("Siswa / tim").fill("Nama Manual Uji");
  await admin.getByRole("button", { name: /Tambahkan “Nama Manual Uji”/ }).click();
  await admin.getByLabel("Nama lomba").fill("Lomba Input Manual Uji");
  await admin.getByLabel("Tingkat").selectOption("PROVINSI");
  await admin.getByLabel("Peringkat").selectOption("JUARA_2");
  await admin.getByRole("button", { name: "Simpan prestasi" }).click();
  await admin.waitForURL(/\/prestasi\/daftar/);
  await expect(admin.getByRole("cell", { name: "Lomba Input Manual Uji", exact: true })).toBeVisible();
  await admin.getByRole("link", { name: "Ubah prestasi Lomba Input Manual Uji" }).click();
  admin.once("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "Hapus prestasi ini" }).click();
  await admin.waitForURL(/\/prestasi\/daftar$/);
  await expect(admin.getByRole("cell", { name: "Lomba Input Manual Uji", exact: true })).toHaveCount(0);
});
