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
- **Warna grafik per sekolah**: SD = merah (`#ED1C24`, `#9E1F26`, `#F2777B`), SMP = biru (`#0E4E96`, `#5B8FD1`), masing-masing dengan pola garis & bentuk marker berbeda (`lib/brand/schools.ts`). *(Fase 3: merah tua Cimahi diubah dari `#8C1C22` ke `#9E1F26` setelah divalidasi dengan validator palet — lolos pemisahan buta warna ΔE 10,9 dan penglihatan normal ΔE 16,3. `#0E4E96` sedikit di bawah batas kecerahan (0,429 vs 0,43) tetapi dipertahankan karena warna resmi SMP. `#F2777B` kontrasnya < 3:1, jadi grafik selalu disertai label langsung, pola garis/marker, dan tabel data.)*
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

### Fase 2 — keputusan kecil (diambil sendiri)
- **Dropdown di template Excel**: SheetJS Community Edition tidak bisa menulis *data validation*. Elemen `<dataValidations>` disisipkan langsung ke XML worksheet lewat modul ZIP (CFB) bawaan SheetJS, tanpa dependensi baru, di posisi yang sesuai skema ECMA-376 (sebelum `<ignoredErrors>`).
- **Isi file disimpan di `import_batches.source_json`** (hasil parsing semua sheet), sehingga pemetaan kolom, baris judul, dan sheet bisa diganti tanpa unggah ulang. File asli tetap disimpan di Storage (`imports/<school_id|network>/<batch_id>/<file>`). Trigger audit tidak menyalin `source_json`/`snapshot_json` agar `audit_logs` tidak membengkak.
- **Pratinjau selalu diturunkan ulang**: `import_rows` dibangun ulang setiap kali pemetaan atau suntingan berubah, dan **sekali lagi tepat sebelum disimpan**, sehingga data yang disimpan selalu divalidasi terhadap data master terkini. Suntingan manual disimpan per nomor baris spreadsheet di `mapping_json.edits`; berganti sheet/baris judul menghapus suntingan.
- **Snapshot untuk rollback dibuat di dalam Postgres** (`to_jsonb` → `jsonb_populate_recordset`), sehingga id, timestamp, dan batch asal setiap baris lama pulih persis. Hanya batch berstatus *Tersimpan* yang bisa dibatalkan; batch yang *Digantikan* harus menunggu unggahan terbarunya dibatalkan dulu.
- **Latihan pekanan menggantikan per baris** (siswa + pekan + mapel + sub-kompetensi), bukan per file, karena satu file bisa berisi beberapa pekan.
- **Kisi-kisi TO yang sudah ada bisa diperbarui** (kunci diralat, butir dianulir): butir dicocokkan per nomor, butir yang tidak ada di file dibiarkan, lalu `is_correct` dan `raw_score` dihitung ulang dari jawaban tersimpan. Kisi-kisi yang membuat TO baru tidak bisa dibatalkan selama TO itu sudah punya hasil.
- **Kolom "Nilai" di samping jawaban per soal** hanya dipakai sebagai pembanding (peringatan bila selisih > 1 poin); nilai yang disimpan selalu hasil hitung dari jawaban. Kolom terpisah "Nilai Skala" diisi ke `scaled_score`.
- **Pencocokan nama otomatis** hanya bila kemiripan ≥ 0,88 **dan** unggul ≥ 0,06 dari kandidat kedua; selebihnya error dengan saran nama. Semua pencocokan berbasis nama berstatus *Perlu dicek*, dan penyimpanan membutuhkan centang konfirmasi.
- **Batas unggahan** 5 MB per file (Server Action dibatasi 6 MB).
- **Uji impor database** (`tests/integration/import.test.ts`) menulis data, sehingga hanya dijalankan oleh `pnpm verify:local` (database sementara), tidak pernah terhadap project Supabase.

## 2026-11-17 — Fase 3 (disetujui)

- **[Disetujui]** **Penguasaan kompetensi** = 70% × (% benar TO) + 30% × (% benar latihan). Di dalam tiap sumber, data dalam 4 pekan terakhir berbobot 2×. Bila hanya satu sumber yang punya data, sumber itu dipakai 100%. "4 pekan terakhir" dihitung mundur dari **akhir periode yang dipilih** di filter (bawaan: hari ini). Batas minimal 5 butir menjumlahkan butir dari kedua sumber.
- **[Disetujui]** **Status siswa per mapel** = status penguasaan atas seluruh butir mapel itu (ambang yang sama). **Status keseluruhan** = status terendah dari semua mapel. **"Berisiko"** (aturan nilai TO) adalah penanda terpisah. KPI "Perlu Intervensi" menghitung siswa yang Perlu Intervensi **atau** Berisiko.
- **[Disetujui]** **% penguasaan sekolah/kelas** = gabungan semua butir siswa di grup itu (total benar ÷ total butir, dengan bobot yang sama), bukan rata-rata per siswa.
- **[Disetujui]** **Rekomendasi intervensi**: skor = (1 − penguasaan) × porsi butir kompetensi itu di kisi-kisi TO dalam periode; hanya kompetensi dengan data cukup; 3 teratas.

### Fase 3 — keputusan kecil (diambil sendiri)
- **Tanpa materialized view (untuk sekarang).** Database hanya menjumlahkan benar/dikerjakan per grup × kompetensi × sumber × keterkinian; rumus dihitung di TypeScript (`lib/metrics`). Dengan ±70 ribu jawaban hal ini cepat, dan angka selalu mutakhir tanpa langkah refresh. MV ditambahkan bila volume menuntut.
- **Butir tidak dijawab** dihitung sebagai butir yang dikerjakan tetapi salah, baik untuk nilai maupun penguasaan, agar konsisten.
- **Keterkinian latihan** memakai tanggal Senin pekan latihan (`week_start ≥ awal jendela`). Keterkinian TO memakai tanggal TO.
- **"TO terakhir"** ditentukan per sekolah (TO terbaru yang diikuti sekolah itu dan sudah punya nilai), sehingga KPI jaringan tetap adil bila jadwal TO antarsekolah berbeda. Target dibandingkan per siswa terhadap target sekolahnya.
- **Ambang tren** naik/turun = 5 poin persen (konstanta `TREND_DELTA`); kedua sisi harus punya data cukup.
- **Periode dibatasi tahun ajaran** terpilih, sehingga satu tampilan tidak pernah mencampur dua angkatan.
- **Kelompok intervensi** bawaan berisi siswa Perlu Intervensi; opsi "Sertakan Berkembang" tersedia.
- **PDF ekspor** memakai font bawaan Helvetica. Penyematan font brand (Cabin/Albert Sans, file TTF) dikerjakan bersama laporan PDF manajemen di Fase 5.
- **Halaman dashboard tidak memakai cache**: setiap kunjungan menghitung ulang dari data terkini (data tidak pernah basi setelah impor).
- **Kinerja RLS (migrasi 0004)**: kebijakan membaca peran dan sekolah pengguna sekali per kueri (`(select app.current_role())`, pola InitPlan Supabase), bukan per baris. Aturan akses tidak berubah (uji RLS 33/33). Dashboard turun dari 40–53 detik menjadi 2–5 detik lewat hotspot; di produksi (Vercel + Supabase sama-sama Singapura) latensi per kueri hanya ±1–2 ms.
- **Grafik**: keterangan target ada di legenda (garis putus abu-abu), bukan label di area plot, agar tidak bertabrakan dengan label ujung seri. Label ujung hanya untuk 2–4 seri. Sumbu jumlah selalu mulai dari 0.
- **Uji E2E dashboard** (`e2e/tka.spec.ts`): hanya membaca; mencakup ringkasan, telusur heatmap, dashboard sekolah (termasuk penolakan sekolah lain), profil siswa, kelompok intervensi (unduh Excel/PDF), perbandingan TO, dan Pengaturan.

## 2026-11-17 — Fase 4 (disetujui)

Dasar: struktur 4 file rekap prestasi asli dari sekolah (dibaca dengan izin, hanya strukturnya; file tidak disalin, tidak di-commit, tidak dikirim ke layanan apa pun). Data uji memakai tiruan anonim.

- **[Disetujui]** **Tingkat tidak baku** (Kecamatan, Bandung Raya, Wilayah Bantim, dll.) → tingkat kosong, nilai asli di Catatan, baris *Perlu dicek*. Nama provinsi → PROVINSI; "Kota/Kabupaten X" → KOTA_KABUPATEN. Lokasi tambahan ("Nasional, Yogyakarta-Online") disimpan di Catatan.
- **[Disetujui]** **Peringkat tidak baku**: bila memuat peringkat baku yang jelas, peringkat itu dipakai dan teks asli disimpan di Catatan (*Juara 1 Kategori Champion* → JUARA_1, *Gold Medal* → MEDALI_EMAS, *Juara Harapan 3* → HARAPAN). Bila tidak (*Medali Partisipasi*, *Piagam Peserta Aktif*, *Honorable Mention*, *Terbaik*, *Semifinal*) → peringkat kosong, teks asli di Catatan, *Perlu dicek*.
- **[Disetujui]** **Baris tanpa nama siswa** boleh disimpan (*Perlu dicek*); dihitung di total prestasi, tidak di jumlah siswa berprestasi sampai nama dilengkapi.
- **[Disetujui]** **Tanggal tidak lengkap**: rentang → tanggal awal; bulan saja → tanggal 1; tahun hilang → dari tahun ajaran terpilih; tanggal asli dicatat sebagai "tanggal perkiraan" di Catatan. Tanggal kosong → *Bermasalah*.
- **[Disetujui]** **Akademik vs Non-Akademik** ditampilkan sebagai satu batang tersegmentasi berlabel angka dan persen (bukan donat 2 bagian, yang sulit dibandingkan).

### Fase 4 — keputusan kecil (diambil sendiri)
- **Rekap kumulatif**: sekolah cenderung mengunggah ulang file yang sama berisi semua prestasi sejak awal tahun. Baris yang sama persis dengan prestasi yang sudah tersimpan (sekolah + tanggal + nama lomba + peserta) otomatis **dilewati** dengan keterangan "sudah tersimpan", sehingga unggah ulang hanya menambah baris baru. Duplikat **di dalam satu file** tetap *Bermasalah*.
- **Kategori disimpulkan** dari bidang/jenis dan nama lomba dengan kamus kata kunci (renang → Olahraga, tari → Seni Budaya, robotik → Teknologi, olimpiade/sains → Akademik, tahfidz → Non-Akademik). Tidak dikenali → kosong + *Perlu dicek*. Kolom Kategori di file selalu diutamakan.
- **Nama lomba kosong** (pola file yang hanya punya bidang) → bidang dipakai sebagai nama lomba, dengan peringatan.
- **Template standar** belum ada dari yayasan; dibuat dari CLAUDE.md §8.1 dan disimpan di `docs/templates/` untuk ditinjau.

## 2026-11-17 — Fase 5 (disetujui)

- **[Disetujui]** **Akun pengguna dibuat lewat undangan email** (Supabase Auth). Email bawaan Supabase dibatasi beberapa email per jam; untuk produksi disarankan SMTP sendiri (Dashboard Supabase → Authentication → SMTP).
- **[Disetujui]** **Data siswa** diimpor/diedit oleh admin sekolah (sekolahnya sendiri) dan Super Admin (semua). Impor menambah atau memperbarui siswa berdasarkan NIS; siswa yang tidak ada di file **tidak** dinonaktifkan otomatis (ada tombol terpisah).
- **[Disetujui]** **Peran Guru/Wali Kelas ditunda**; saat ini guru melihat dashboard sekolahnya dan mencatat intervensi.
- **[Disetujui]** **Deploy**: konfigurasi dan langkah disiapkan; menghubungkan repositori ke akun Vercel yayasan dilakukan pemilik akun.

### Deploy uji coba (2026-11-18)
- Vercel `https://portal-tka-excellence.vercel.app`, fungsi di `sin1`, tersambung ke project Supabase pengembangan (data dummy) atas pilihan pemilik akun. Produksi dengan data asli nanti memakai project Supabase terpisah + `pnpm db:seed --production`.
- pnpm 12 memerlukan `ENABLE_EXPERIMENTAL_COREPACK=1` di Vercel dan keputusan eksplisit untuk setiap *build script* dependensi (`allowBuilds` di `pnpm-workspace.yaml`).
- Uji E2E baca-saja (TKA, Fase 5, aksesibilitas) lolos terhadap situs online; jalankan dengan `E2E_BASE_URL=https://… pnpm test:e2e e2e/tka.spec.ts e2e/fase5.spec.ts e2e/a11y.spec.ts`.

### Peluncuran produksi (2026-11-18)
- Project Supabase **produksi terpisah** (region `ap-southeast-1`, Singapura, sama dengan fungsi Vercel `sin1`; project pertama yang terlanjur dibuat di Tokyo diganti selagi masih kosong) dan project Vercel kedua dari repo yang sama. Situs uji coba tetap hidup untuk pelatihan (data dummy). Push ke `main` memperbarui keduanya.
- Disiapkan dengan `pnpm prod:migrate` → `pnpm prod:seed` (hanya data master: 5 sekolah, TA 2025/2026 & 2026/2027 (aktif), 4 mapel, 35 sub-kompetensi, 11 pengaturan) → `pnpm prod:admin` (satu Super Admin lewat undangan). Diperiksa: tidak ada siswa/kelas/TO/prestasi/akun demo, semua tabel `public` ber-RLS, bucket `imports` privat.
- Email undangan memakai **SMTP Google Workspace yayasan** (`smtp.gmail.com`, App Password akun pengirim). Email bawaan Supabase di project baru menolak alamat di luar anggota tim organisasi Supabase ("Email address … is invalid"), sehingga tidak bisa dipakai untuk mengundang admin sekolah.
- **Izin tabel ditulis eksplisit** (migrasi 0007). Project Supabase baru tidak lagi memberi izin tabel bawaan ke `authenticated`/`service_role`, sehingga login di produksi gagal dengan `permission denied for table profiles`. Sekarang: `authenticated` baca/tulis (baris tetap dibatasi RLS), `audit_logs` hanya baca, `anon` tanpa akses, dan TRUNCATE dicabut karena melewati RLS. `pnpm verify:local` tidak lagi memberi izin bawaan, jadi tabel baru di migrasi berikutnya **wajib** menyertakan `grant`-nya sendiri.
- `NEXT_PUBLIC_SUPABASE_URL` harus berupa origin saja (`https://<ref>.supabase.co`), tanpa `/rest/v1/`; akhiran itu membuat Auth admin API menolak permintaan.

### Keputusan kecil Fase 5
- **Status Pusat Input Pekanan** (aturan lengkap di `docs/METRICS.md`): siswa yang diharapkan = siswa aktif kelas 6 (SD) / 9 (SMP) pada TA aktif. *Latihan* Lengkap bila semua siswa itu punya catatan latihan pekan tersebut. *Hasil TO* dihitung untuk TO yang dilaksanakan pekan ini atau pekan lalu; Lengkap bila semua siswa punya baris nilai (hadir/tidak hadir) dan jawaban per butir; nilai total saja = Sebagian. *Prestasi* hanya informasi dan tidak memengaruhi status, karena pekan tanpa lomba itu wajar.
- **Nama pengunggah** untuk Manajemen/Admin Sekolah dibaca lewat fungsi `app.staff_name()` (migrasi 0006) yang hanya mengembalikan nama tampilan, bukan email/peran, dan hanya untuk pengguna aktif. RLS profil tetap: selain Super Admin hanya bisa membaca profilnya sendiri.
- **Menonaktifkan akun** = `profiles.is_active = false` **dan** *ban* di Supabase Auth, sehingga sesi lama tidak bisa diperpanjang. Super Admin tidak bisa menonaktifkan atau menurunkan peran akunnya sendiri (mencegah terkunci).
- **NIS tidak bisa diubah** dari formulir siswa karena menjadi kunci pencocokan impor; koreksi NIS lewat Super Admin.
- **Font PDF**: instans statis TTF Cabin (600/700) dan Albert Sans (400/600/700) dari Google Fonts, lisensi SIL OFL 1.1 (teks lisensi di `lib/pdf/fonts/`). Disertakan ke fungsi server lewat `outputFileTracingIncludes` bersama logo, karena di Vercel folder `public/` tidak otomatis ikut terbaca dari disk.
- **Laporan Manajemen** (`/laporan`) hanya untuk Super Admin dan Manajemen; angka diambil dari pemuat yang sama dengan dashboard sehingga selalu cocok. Admin sekolah tetap punya ekspor per dashboard.
- **Kode sub-kompetensi baru** dibuat otomatis `<KODE ELEMEN>-NN` (nomor berikutnya yang kosong) agar konsisten dengan seed.

### Housekeeping
- File spesifikasi diganti nama `CLAUDE.md.md` → `CLAUDE.md`; logo dipindah dari `brand-assets/` ke `public/brand/`.
- Template prestasi standar (`Ringkasan_Prestasi_2026_Template_Standar.xlsx`) **belum tersedia** di repo; dibutuhkan paling lambat Fase 4 di `docs/templates/`.
- 2026-11-17: project Supabase cloud tersambung. Migrasi 0000–0003 dan seed diterapkan; uji RLS (37/37, termasuk lapisan Data API) dan E2E Playwright lolos terhadap cloud. `DATABASE_URL_DIRECT` memakai *session pooler* (port 5432) karena host langsung Supabase hanya IPv6.
- **E2E Playwright** ditambahkan di Fase 2 (bukan di akhir) karena alur impor adalah alur kritis. Tes berjalan di port 3100 dan membatalkan sendiri unggahannya, sehingga data seed tetap utuh.
- **`await connection()` di `getClaims()`**: `supabase.auth.getClaims()` membaca jam (masa berlaku token), dan Next.js 16 melarangnya saat prerender kecuali render sudah ditandai dinamis. Semua pemeriksaan sesi kini eksplisit berjalan saat request.
