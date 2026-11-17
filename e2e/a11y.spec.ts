/**
 * Accessibility and responsiveness checks (CLAUDE.md §5.2, §12), read-only.
 * - axe-core WCAG 2.1 A/AA on the main pages, one test per page and role.
 * - No horizontal page scroll at phone (390px) and tablet (820px) widths;
 *   screenshots saved to test-results/responsive/ for visual review.
 * Each role signs in once; the session is reused from test-results/.auth/.
 */
import { existsSync, mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO = "demo.talentajuara.test";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const AUTH_DIR = "test-results/.auth";

test.skip(!PASSWORD, "SEED_DEMO_PASSWORD belum diisi di .env.local");

async function pageAs(browser: Browser, local: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const file = `${AUTH_DIR}/${local}.json`;
  if (!existsSync(file)) {
    mkdirSync(AUTH_DIR, { recursive: true });
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.getByLabel("Email").fill(`${local}@${DEMO}`);
    await p.getByLabel("Kata sandi").fill(PASSWORD);
    await p.getByRole("button", { name: "Masuk" }).click();
    await expect(p.getByRole("heading", { name: "Beranda" })).toBeVisible();
    await ctx.storageState({ path: file });
    await ctx.close();
  }
  return (await browser.newContext({ viewport, storageState: file })).newPage();
}

/** Waits until streamed sections have replaced their skeletons. */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 120_000 });
}

async function axe(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal") // Next.js dev overlay, not part of the product
    .analyze();
  const problems = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}${v.nodes.length > 3 ? ` (+${v.nodes.length - 3})` : ""}`,
  );
  expect(problems, `${path}\n${problems.join("\n")}`).toEqual([]);
}

test("aksesibilitas: /login", async ({ page }) => axe(page, "/login"));

const PAGES: [role: string, path: string][] = [
  ["manajemen", "/"],
  ["manajemen", "/tka"],
  ["manajemen", "/tka/sekolah/SDTJBDG"],
  ["manajemen", "/tka/kompetensi"],
  ["manajemen", "/prestasi"],
  ["manajemen", "/prestasi/daftar"],
  ["manajemen", "/input"],
  ["manajemen", "/laporan"],
  ["manajemen", "/master/siswa"],
  ["superadmin", "/pengguna"],
  ["superadmin", "/audit"],
  ["superadmin", "/pengaturan"],
  ["superadmin", "/master/kompetensi"],
  ["superadmin", "/master/tahun-ajaran"],
  ["superadmin", "/tka/bandingkan"],
  ["superadmin", "/tka/intervensi?sekolah=SDTJBDG"],
  ["admin.sdtjbdg", "/input/unggah/hasil"],
  ["admin.sdtjbdg", "/input/unggah/prestasi"],
  ["admin.sdtjbdg", "/prestasi/tambah"],
  ["admin.sdtjbdg", "/master/kelas"],
];

for (const [role, path] of PAGES) {
  test(`aksesibilitas: ${path} (${role})`, async ({ browser }) => axe(await pageAs(browser, role), path));
}

test("aksesibilitas: profil siswa (superadmin)", async ({ browser }) => {
  const page = await pageAs(browser, "superadmin");
  await page.goto("/tka/sekolah/SDTJBDG");
  await settle(page);
  const href = await page.locator('a[href^="/tka/siswa/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await axe(page, href!);
});

for (const [label, width, height] of [["ponsel", 390, 844], ["tablet", 820, 1180]] as const) {
  for (const path of ["/", "/tka", "/tka/sekolah/SDTJBDG", "/prestasi", "/input", "/laporan"]) {
    test(`responsif ${label} (${width}px): ${path}`, async ({ browser }) => {
      const page = await pageAs(browser, "manajemen", { width, height });
      await page.goto(path);
      await settle(page);
      const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      await page.screenshot({ path: `test-results/responsive/${label}${path === "/" ? "_beranda" : path.replace(/\//g, "_")}.png`, fullPage: true });
      expect(scroll, `lebar konten ${scroll}px > layar ${client}px`).toBeLessThanOrEqual(client + 1);
    });
  }
}
