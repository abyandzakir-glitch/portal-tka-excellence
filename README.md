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
| `pnpm verify:local` | migrasi + seed + uji RLS + uji impor (simpan/ganti/batalkan) + pembuatan file contoh impor, di PostgreSQL 17 sementara, **tanpa** Supabase/Docker |
| `pnpm build` | build produksi (juga memvalidasi aturan Suspense/`cacheComponents`) |
| `pnpm test:e2e` | uji E2E Playwright (alur impor + pembatasan peran) terhadap Supabase di `.env.local`; butuh seed + `SEED_DEMO_PASSWORD`. Menjalankan `next dev` di port 3100; data kembali seperti semula setelah tes. Pemasangan pertama: `pnpm exec playwright install chromium` |

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
lib/metrics/         rumus metrik (fungsi murni + unit test)
drizzle/             migrasi SQL (0001 = RLS + audit, 0003 = Storage + penjaga rollback)
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

## Deploy

Vercel + Supabase. Set variabel lingkungan yang sama dengan `.env.local` di Vercel (kecuali `DATABASE_URL_DIRECT` dan `SEED_DEMO_PASSWORD`, yang hanya dipakai migrasi/seed dari mesin pengembang). Domain produksi belum ditentukan.
