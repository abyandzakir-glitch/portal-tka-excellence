# Catatan Keputusan Teknis

Format: setiap keputusan berisi tanggal, keputusan, dan alasan. Keputusan yang disetujui yayasan ditandai **[Disetujui]**.

## 2026-11-17 — Fase 0 (disetujui seluruhnya)

### Infrastruktur
- **[Disetujui]** Pengembangan memakai **project Supabase cloud** (region Singapore), bukan Supabase lokal (tidak perlu Docker).
- **[Disetujui]** Hosting produksi: **Vercel + Supabase (Singapore)**. Domain: *belum ditentukan* (tidak menghambat Fase 1–4).
- **[Disetujui]** Package manager: **pnpm**. Runtime: Node.js LTS.

### Arsitektur
- **ORM: Drizzle.** SQL-first, sehingga kebijakan RLS, trigger audit, dan materialized view berada di migrasi yang sama dengan skema. Query aplikasi dijalankan dalam transaksi `set local role authenticated` + `request.jwt.claims`, sehingga RLS tetap berlaku walaupun lewat ORM. Koneksi tanpa RLS (service role) hanya untuk seed, migrasi, dan job sistem.
- **Akses data** lewat Server Components / Server Actions. Service key tidak pernah dikirim ke klien.
- **Audit log** dicatat dengan **trigger Postgres** pada setiap tabel data, sehingga impor massal juga tercatat.
- **Rumus metrik** berupa fungsi murni di `lib/metrics/` dengan unit test (Vitest).
- **Agregasi**: materialized view untuk heatmap kompetensi dan rekap prestasi, di-refresh setelah setiap commit batch impor.
- **PDF**: `@react-pdf/renderer` di server. **Filter global** disimpan di query param URL.

### Skema (penyempurnaan dari §10 CLAUDE.md)
- `class_enrollments(student_id, class_id, academic_year_id)` menyimpan riwayat kelas per tahun ajaran; `students.current_class_id` tidak dipakai.
- `school_id` disalin langsung ke `tryout_scores`, `item_responses`, dan `practice_logs` agar kebijakan RLS sederhana dan cepat.
- `tryout_schools(tryout_id, school_id)`: satu TO bisa dipakai satu sekolah atau beberapa sekolah. Keputusan ini sekaligus menjawab pertanyaan Fase 0 no. 10 (TO bersama vs per sekolah), yang belum dijawab spesifik: skema mendukung keduanya.
- `achievement_participants(achievement_id, student_id NULL, raw_name)` menggantikan `achievement_students`. Individu/Tim disimpulkan dari jumlah baris.
- `import_rows` sebagai area staging untuk pratinjau dan edit sebelum commit.
- `settings` punya scope global / per sekolah (+ opsional per mapel).
- `profiles.role` = `super_admin | viewer | school_admin | teacher` (UI teacher baru dibuat di fase akhir).
- Enum kategori/tingkat/peringkat prestasi mengikuti persis nilai di §8.1 (huruf besar).

### Data TKA
- **[Disetujui]** Siswa yang dipantau: **kelas akhir** (6 SD, 9 SMP); skema tetap mendukung semua kelas.
- **[Disetujui]** `raw_score` = % butir benar × 100 (0–100). `scaled_score` diisi bila tersedia dari penyelenggara. Pembanding target: `scaled_score` jika ada, selain itu `raw_score`.
- **[Disetujui]** Bobot keterkinian default: data ≤ 4 pekan terakhir berbobot **2×**, lebih lama **1×** (bisa diubah di Pengaturan).
- **[Disetujui]** Log latihan tanpa sub-kompetensi dihitung untuk volume & akurasi, **tidak** untuk penguasaan kompetensi.
- **[Disetujui]** Butir dianulir dikeluarkan dari pembilang **dan** penyebut (nilai maupun penguasaan).

### Prestasi
- **[Disetujui]** Donut "Akademik vs Non-Akademik" = {`AKADEMIK`, `TEKNOLOGI`} vs kategori lain (pengelompokan bisa diubah di Pengaturan). "Bidang" = 6 kategori baku; tidak ada kolom tambahan.
- **[Disetujui]** Poin Prestasi default = bobot tingkat × bobot peringkat:
  - Tingkat: Kota/Kab 1, Provinsi 2, Nasional 4, Internasional 6 (kosong: 1)
  - Peringkat: Juara 1 / Medali Emas 5, Juara 2 / Medali Perak 4, Juara 3 / Medali Perunggu 3, Harapan 2, Finalis 1, kosong 0,5
- **[Disetujui]** Peserta yang tidak ada di master siswa tetap disimpan sebagai nama mentah dan dihitung di total. "Siswa unik" dihitung dari `student_id` jika cocok, selain itu dari nama yang dinormalkan + sekolah.

### Keamanan & privasi
- **[Disetujui]** Login email + password. Akun hanya dibuat oleh Super Admin lewat undangan; tidak ada pendaftaran terbuka.
- **[Disetujui]** Ekstraksi AI **nonaktif secara default**. Super Admin harus mengaktifkannya di Pengaturan; layar impor menampilkan pemberitahuan pemrosesan oleh pihak ketiga.

## 2026-11-17 — Fase 1 (keputusan kecil, diambil sendiri)

- **Next.js 16.4**: `middleware` sekarang bernama `proxy.ts`. Dengan `cacheComponents`, semua pembacaan sesi/cookie dibungkus `<Suspense>`; kerangka halaman tetap statis (Partial Prerender). Proxy hanya pemeriksaan optimistis; setiap halaman/Server Action memanggil `requireUser()` lagi, dan RLS tetap menjadi lapisan otorisasi utama.
- **Query aplikasi lewat `queryAsUser()`**: setiap query berjalan dalam transaksi `set local role authenticated` + klaim JWT terverifikasi (`supabase.auth.getClaims()`), sehingga RLS berlaku walau memakai Drizzle.
- **Fungsi `cn` lokal**: generator shadcn menambahkan paket npm pihak ketiga `cn@0.5.2`. Diganti fungsi lokal standar (`clsx` + `tailwind-merge`) untuk menghindari dependensi tambahan yang asal-usulnya tidak terverifikasi.
- **Logo**: PNG asli berupa kanvas 4500×4500 dengan banyak ruang kosong, dan file `*-symbol.png` masih memuat logotype berwarna putih. Dibuat salinan web ter-crop (`public/brand/web/`, lewat `pnpm brand:trim-logos`) — hanya crop + skala seragam, tanpa mengubah bentuk/warna. File asli tidak diubah. Zona bersih 1/3 tinggi simbol diterapkan lewat padding komponen `MasterLogo`.
- **Warna grafik per sekolah**: SD = merah (`#ED1C24`, `#8C1C22`, `#F2777B`), SMP = biru (`#0E4E96`, `#5B8FD1`), masing-masing dengan pola garis & bentuk marker berbeda (`lib/brand/schools.ts`).
- **Audit log**: trigger per baris untuk master data, prestasi, intervensi, pengaturan, pengguna; trigger per *statement* (jumlah baris + ID batch) untuk tabel bervolume tinggi (`tryout_scores`, `item_responses`, `practice_logs`) agar satu impor TO tidak menghasilkan ribuan baris audit. `import_rows` (staging) tidak diaudit; batch-nya diaudit.
- **Policy RLS tidak memakai `FOR ALL`** pada tabel yang saling mereferensikan (`tryouts` ↔ `tryout_schools`) untuk mencegah rekursi policy; ditulis per perintah.
- **Level kognitif Bahasa Indonesia** dibiarkan kosong di seed karena CLAUDE.md §7.1 hanya mendefinisikannya untuk Matematika.
- **Seed dummy**: deterministik (seed RNG tetap); NISN diawali `99` sebagai penanda dummy; akun demo memakai domain `demo.talentajuara.test` (`.test` adalah domain cadangan, bukan kotak surat nyata); kata sandi demo dari `SEED_DEMO_PASSWORD`, tidak pernah ditulis di kode.
- **Contoh kasus tepi di seed**: TO 4 Bahasa Indonesia SDTJPKU hanya berisi nilai total (fallback); butir no. 7 di setiap TO 3 dianulir; ±3% siswa absen per TO; 8% prestasi tanpa padanan peringkat ("Medali Partisipasi" dll. di Catatan); nama alumni yang tidak ada di master siswa; prestasi periode yang sama tahun lalu untuk perbandingan.
- **Verifikasi lokal tanpa Supabase** (`pnpm verify:local`): PostgreSQL 17 sementara (paket `embedded-postgres`, dikunci ke 17.9 agar sama dengan versi mayor Supabase) + stub skema `auth`. PGlite sempat dicoba tetapi ditinggalkan karena emulasi protokol socket-nya memutus koneksi pada transaksi.
- **Prepared statement**: seed & uji RLS memakai `prepare: true` pada koneksi langsung (`DATABASE_URL_DIRECT`); aplikasi memakai `prepare: false` karena lewat pooler mode transaksi (port 6543).

## 2026-11-17 — Fase 2 (disetujui)

- **[Disetujui]** **Kisi-kisi TO**: Super Admin mengunggah kisi untuk TO bersama jaringan; admin sekolah boleh membuat TO khusus sekolahnya sendiri. **Hasil TO** selalu diunggah oleh admin masing-masing sekolah (Super Admin juga bisa, atas nama sekolah mana pun).
- **[Disetujui]** **Unggah ulang hasil TO** untuk TO + sekolah yang sama **menggantikan** data sebelumnya. Batch lama ditandai *Digantikan*; data lama disimpan sebagai snapshot di batch baru, sehingga bila batch baru dibatalkan, data lama dipulihkan.
- **[Disetujui]** **Siswa yang tidak ada di master** → baris *error* dengan saran nama mirip, tidak disimpan, tidak dibuat otomatis.
- **[Disetujui]** **Semua jawaban kosong** di hasil TO → siswa dianggap **absen**. Jawaban kosong sebagian → butir itu "tidak dijawab" (dihitung salah).

### Housekeeping
- File spesifikasi diganti nama `CLAUDE.md.md` → `CLAUDE.md`; logo dipindah dari `brand-assets/` ke `public/brand/`.
- Template prestasi standar (`Ringkasan_Prestasi_2026_Template_Standar.xlsx`) **belum tersedia** di repo; dibutuhkan paling lambat Fase 4 di `docs/templates/`.
