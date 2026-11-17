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
4. Terapkan migrasi database (tabel, RLS, trigger audit):
   ```bash
   pnpm db:migrate
   ```
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
| `pnpm verify:local` | migrasi + seed + uji RLS di PostgreSQL 17 sementara, **tanpa** Supabase/Docker |
| `pnpm build` | build produksi (juga memvalidasi aturan Suspense/`cacheComponents`) |

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
drizzle/             migrasi SQL (0001 = RLS + audit)
scripts/seed/        data dummy deterministik
tests/integration/   uji RLS
proxy.ts             penyegar sesi & pengalih ke /login
```

## Deploy

Vercel + Supabase. Set variabel lingkungan yang sama dengan `.env.local` di Vercel (kecuali `DATABASE_URL_DIRECT` dan `SEED_DEMO_PASSWORD`, yang hanya dipakai migrasi/seed dari mesin pengembang). Domain produksi belum ditentukan.
