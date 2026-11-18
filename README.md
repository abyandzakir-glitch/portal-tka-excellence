# Portal Academic Excellence — Sekolah Talenta Juara

*Developing Capable Muslim Leaders*

Portal internal untuk memantau persiapan TKA dan prestasi siswa di lima sekolah Talenta Juara. Spesifikasi lengkap ada di [CLAUDE.md](CLAUDE.md); keputusan teknis di [docs/DECISIONS.md](docs/DECISIONS.md).

**Stack:** Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 + shadcn/ui · Supabase (PostgreSQL, Auth, Storage, RLS) · Drizzle ORM · Zod · Vitest.

## Prasyarat

- Node.js 20.9+ (dikembangkan dengan Node 24 LTS) dan pnpm (`npm install -g pnpm`)
- Project Supabase (region Singapore disarankan)

## Setup lokal

1. Pasang dependensi:
   ```bash
   pnpm install
   ```
2. Salin `.env.example` menjadi `.env.local`, lalu isi nilainya dari Supabase Dashboard → Project Settings (lihat komentar di file tersebut).
3. Konfigurasi Supabase Dashboard:
   - **Authentication → Sign In / Providers → Email**: matikan *Allow new users to sign up* (akun hanya dibuat oleh Super Admin).
   - **Authentication → URL Configuration**: isi *Site URL* (mis. `http://localhost:3000` untuk lokal).
   - **Authentication → Email Templates**: arahkan tautan *Invite user* ke `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite` dan *Reset password* ke `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`.
4. Terapkan migrasi database (tabel, RLS, trigger audit, bucket Storage `imports` untuk file unggahan):
   ```bash
   pnpm db:migrate
   ```
   Migrasi `0003` membuat bucket privat `imports` beserta kebijakannya. Pastikan di Dashboard → Storage bucket tersebut muncul dan **tidak** publik.
5. Isi data dummy (5 sekolah, 300 siswa, 16 TO, 8 pekan latihan, 80 prestasi, 5 akun demo):
   ```bash
   pnpm db:seed            # menolak berjalan jika data sudah ada
   pnpm db:seed --reset    # HAPUS semua data portal lalu isi ulang
   pnpm db:seed --production  # hanya data master, tanpa data dummy (untuk produksi)
   ```
   Akun demo (`*@demo.talentajuara.test`) memakai kata sandi dari `SEED_DEMO_PASSWORD`.
6. Jalankan:
   ```bash
   pnpm dev
   ```

## Pemeriksaan kualitas

| Perintah | Isi |
|---|---|
| `pnpm check` | lint + typecheck + unit test |
| `pnpm test:rls` | uji isolasi RLS terhadap database di `.env.local` (jalankan setelah seed) |
| `pnpm verify:local` | migrasi + seed (termasuk mode produksi) + uji RLS + angka dashboard vs hitungan manual + uji impor (simpan/ganti/batalkan) + pembuatan file contoh impor, di PostgreSQL 17 sementara, **tanpa** Supabase/Docker |
| `pnpm build` | build produksi (juga memvalidasi aturan Suspense/`cacheComponents`) |
| `pnpm test:e2e` | uji E2E Playwright (alur impor, dashboard, Pusat Input, pengguna, laporan PDF, pembatasan peran) + uji aksesibilitas axe (WCAG 2.1 AA) dan tampilan ponsel/tablet (`e2e/a11y.spec.ts`) terhadap Supabase di `.env.local`; butuh seed + `SEED_DEMO_PASSWORD`. Menjalankan `next dev` di port 3100; data kembali seperti semula setelah tes. Tangkapan layar tersimpan di `test-results/`. Pemasangan pertama: `pnpm exec playwright install chromium` |

> **Koneksi database:** host langsung `db.<project>.supabase.co` hanya punya alamat IPv6. Bila jaringan Anda tidak mendukung IPv6, isi `DATABASE_URL_DIRECT` dengan *session pooler* (host pooler yang sama dengan `DATABASE_URL`, port **5432**). `NEXT_PUBLIC_SUPABASE_URL` harus alamat dasar project (`https://<project>.supabase.co`), tanpa `/rest/v1/`.

## Struktur folder

```
app/(auth)/          halaman login & atur kata sandi
app/(portal)/        semua halaman setelah login (Beranda, TKA, Prestasi, Master Data, …)
app/auth/callback/   penerima tautan undangan & reset kata sandi
components/brand/    Logo Master, badge sekolah, motif diagonal
components/layout/   kerangka portal, navigasi, empty state
lib/db/              skema Drizzle, klien DB, wrapper RLS (withRls)
lib/auth/            sesi & peran (requireUser, queryAsUser)
lib/format/          format angka/tanggal Indonesia, pekan, tahun ajaran
lib/settings/        nilai default ambang, bobot, target
lib/import/          mesin impor: baca file, deteksi header, pemetaan kolom, parser nilai,
                     pencocokan siswa/kompetensi, validator TKA (tka/), template (templates/),
                     staging/commit/rollback ke database (db/)
lib/metrics/         rumus metrik dan status kelengkapan input (fungsi murni + unit test)
lib/tka/, lib/achievements/  pemuat data dashboard TKA & Prestasi (dipakai halaman, ekspor, dan laporan)
lib/report/          Laporan Manajemen PDF
lib/pdf/             tema PDF bersama + font Cabin & Albert Sans (OFL)
lib/audit/           format catatan audit (ringkasan, sebelum/sesudah)
drizzle/             migrasi SQL (0001 = RLS + audit, 0003 = Storage + penjaga rollback,
                     0004 = RLS cepat, 0006 = nama pengunggah untuk Pusat Input)
scripts/seed/        data dummy deterministik
tests/integration/   uji RLS dan uji impor (database)
tests/unit/          uji impor template rapi vs file berantakan
docs/contoh-impor/   file contoh impor (rapi & berantakan) dari data dummy
proxy.ts             penyegar sesi & pengalih ke /login
```

## Alur impor data (Input Pekanan)

1. **Unggah** (`/input/unggah/[jenis]`): file disimpan di bucket `imports`, dibaca, lalu dibuat *draf* batch.
2. **Pemetaan & pratinjau** (`/input/batch/[id]`): sheet, baris judul, dan kolom dipetakan otomatis (atau memakai pemetaan yang pernah dikonfirmasi sekolah itu). Setiap baris divalidasi; baris bermasalah bisa diubah langsung.
3. **Simpan**: divalidasi ulang terhadap data master terbaru, lalu ditulis dalam satu transaksi. Data yang digantikan disimpan sebagai snapshot di batch.
4. **Batalkan** (Super Admin): data batch dihapus dan snapshot dipulihkan. Pembatasan ini juga dijaga trigger database.

Lihat [docs/PANDUAN_ADMIN.md](docs/PANDUAN_ADMIN.md) untuk panduan bagi admin sekolah.

### Ekstraksi AI prestasi (opsional)
PDF, foto, dan teks bebas dibaca dengan Claude API (`lib/achievements/ai-extract.ts`). Fitur ini hanya berjalan bila **dua-duanya** terpenuhi:
1. `ANTHROPIC_API_KEY` diisi di `.env.local` (dan di Vercel). Model diatur lewat `ANTHROPIC_MODEL`; kosong = `claude-opus-5-5`.
2. Super Admin menyalakan **Ekstraksi AI** di menu Pengaturan (nonaktif secara bawaan).

Yang dikirim hanya isi unggahan; daftar siswa tidak pernah dikirim. Hasil AI selalu melewati pratinjau dan konfirmasi.

## Menu utama

| Menu | Peran | Isi |
|---|---|---|
| Beranda | semua | pintasan sesuai peran |
| TKA | semua | ringkasan jaringan, dashboard sekolah, profil siswa, kelompok intervensi, perbandingan TO |
| Prestasi | semua | dashboard prestasi, daftar, tambah/ubah (penulis data), ekspor Excel/PDF |
| Laporan Manajemen | Super Admin, Manajemen | satu PDF: TKA per mapel, nilai per sekolah, kompetensi terlemah, prestasi, kelengkapan input |
| Input Pekanan | semua (unggah: Super Admin & Admin Sekolah) | status Belum/Sebagian/Lengkap per sekolah per pekan, unggah data, riwayat |
| Master Data | semua (ubah: sesuai peran) | sekolah, tahun ajaran, kelas, siswa (impor Excel & ubah), mapel, kompetensi |
| Pengaturan | Super Admin | ambang & bobot penguasaan, target TO, siswa berisiko, Poin Prestasi, saklar AI |
| Pengguna | Super Admin | undang, ubah peran/sekolah, kirim ulang undangan, nonaktifkan |
| Audit Log | Super Admin | riwayat perubahan dengan saringan dan rincian sebelum/sesudah |

## Deploy (Vercel + Supabase)

Target hosting yang disarankan; domain produksi belum ditentukan yayasan.

1. **Supabase produksi.** Buat project Supabase **baru** (region Singapore), terpisah dari project uji coba. Isi kredensialnya di berkas `.env.produksi` (sudah ada templatenya, diabaikan git), lalu:
   ```bash
   pnpm prod:migrate   # menolak berjalan bila .env.produksi menunjuk ke project uji coba
   pnpm prod:seed      # hanya data master: 5 sekolah, tahun ajaran, mapel, kompetensi Pusmendik, pengaturan default
   ```
   `prod:seed` tidak membuat siswa, nilai, prestasi, atau akun dummy, dan menolak berjalan bila database sudah berisi data. Data siswa diimpor admin sekolah lewat Master Data → Siswa → *Impor data siswa*.
2. **Akun Super Admin pertama:**
   ```bash
   pnpm prod:admin --email alamat@yayasan --name "Nama Lengkap"
   ```
   Skrip mengirim undangan email dan menyimpan profil Super Admin. Pengguna berikutnya diundang dari menu **Pengguna**.
3. **Vercel.** *Add New Project* → impor repositori GitHub → framework Next.js terdeteksi otomatis. Isi *Environment Variables*:

   | Variabel | Wajib | Catatan |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ya | `https://<project>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ya | kunci publik |
   | `SUPABASE_SECRET_KEY` | ya | **rahasia**; untuk mengundang pengguna |
   | `DATABASE_URL` | ya | pooler *transaction mode* port 6543 |
   | `ANTHROPIC_API_KEY` | tidak | hanya bila fitur AI dipakai |
   | `ANTHROPIC_MODEL` | tidak | kosong = `claude-opus-5-5` |

   Tambahkan juga `ENABLE_EXPERIMENTAL_COREPACK` = `1` agar Vercel memakai versi pnpm dari `packageManager` di `package.json`.

   `DATABASE_URL_DIRECT` dan `SEED_DEMO_PASSWORD` **tidak** diisi di Vercel. Region fungsi sudah diatur ke `sin1` (Singapore) lewat `vercel.json` agar dekat dengan database.
4. **URL Supabase.** Setelah domain Vercel diketahui, isi Supabase → Authentication → URL Configuration → *Site URL* dengan domain itu, dan tambahkan `https://<domain>/**` ke *Redirect URLs*. Template email undangan & reset kata sandi memakai `{{ .SiteURL }}` (lihat Setup lokal langkah 3).
5. **Email.** Email bawaan Supabase dibatasi beberapa pesan per jam. Untuk produksi pasang SMTP sendiri: Supabase → Authentication → SMTP Settings (mis. layanan email yayasan).
6. **Periksa:** masuk sebagai Super Admin, undang satu Admin Sekolah, buka tautan undangan, atur kata sandi, lalu pastikan Admin Sekolah hanya melihat sekolahnya.

File font PDF (`lib/pdf/fonts/`) dan logo ikut ke fungsi server lewat `outputFileTracingIncludes` di `next.config.ts`.
