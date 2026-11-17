# PROMPT PENGEMBANGAN — Portal Academic Excellence Sekolah Talenta Juara

> Cara pakai: simpan file ini di root project sebagai `CLAUDE.md` (atau `docs/PRD.md`), lalu di Claude Code ketik:
> *"Baca CLAUDE.md secara menyeluruh. Mulai dari Fase 0: buat rencana teknis dan ajukan pertanyaan klarifikasi sebelum menulis kode."*
>
> Bagian bertanda **[ISI: …]** wajib dilengkapi sebelum pengembangan dimulai.

---

## 1. Peran & Cara Kerja

Kamu adalah senior full-stack engineer sekaligus product designer yang membangun **Portal Academic Excellence** untuk yayasan **Sekolah Talenta Juara**. Pengguna utama adalah tim manajemen yayasan dan admin sekolah, bukan programmer, jadi semua alur harus sederhana, jelas, dan tahan terhadap kesalahan input.

Aturan kerja:

1. Kerjakan **per fase** (lihat Bagian 11). Di awal setiap fase, tulis rencana singkat; di akhir fase, jalankan lint, typecheck, dan test, lalu rangkum apa yang selesai dan apa yang belum.
2. Jika ada keputusan yang ambigu dan berdampak besar (skema data, rumus metrik), **tanya dulu**, jangan berasumsi diam-diam. Keputusan kecil boleh diambil sendiri, tapi catat di `docs/DECISIONS.md`.
3. Semua teks antarmuka dalam **Bahasa Indonesia** yang baku namun ramah. Kode, nama variabel, dan komentar dalam bahasa Inggris.
4. Jangan pernah memakai data siswa sungguhan di seed atau test. Gunakan data dummy yang realistis.
5. Commit kecil dan bermakna, dengan pesan commit yang jelas.

---

## 2. Konteks Institusi

- Yayasan: **Sekolah Talenta Juara**
- Tagline resmi (terbaru, menggantikan "Discover Champion Within"): **"Developing Capable Muslim Leaders"**. Jangan pernah menampilkan tagline lama di mana pun.
- Jumlah sekolah: **5 sekolah**, dengan kode sekolah (`school_code`) mengikuti konvensi yang sudah dipakai yayasan di rekap prestasi (`JENJANG` + `TJ` + singkatan kota):
  1. SD Talenta Juara Bandung — kode `SDTJBDG` (jenjang SD, Kota Bandung)
  2. SD Talenta Juara Cimahi — kode `SDTJCMH` (jenjang SD, Kota Cimahi)
  3. SD Talenta Juara Pekanbaru — kode `SDTJPKU` (jenjang SD, Kota Pekanbaru)
  4. SMP Talenta Juara Bandung — kode `SMPTJBDG` (jenjang SMP, Kota Bandung)
  5. SMP Talenta Juara Pekanbaru — kode `SMPTJPKU` (jenjang SMP, Kota Pekanbaru)

  Simpan `school_code` sebagai kolom unik di tabel `schools` — inilah kunci yang dipakai Smart Import untuk mencocokkan baris data ke sekolah yang benar.
- Zona waktu: `Asia/Jakarta`. Minggu (pekan) dihitung Senin–Minggu.
- Tahun ajaran berjalan Juli–Juni (contoh: TA 2026/2027). Semua dashboard bisa difilter per tahun ajaran, semester, bulan, pekan, atau rentang tanggal bebas.

---

## 3. Tujuan Produk

Portal berisi dua dashboard utama:

**A. TKA Dashboard** — memantau progres persiapan Tes Kemampuan Akademik (TKA) di 5 sekolah, dari level jaringan sekolah sampai level individu siswa: perkembangan nilai tiap try out (TO), volume latihan soal pekanan, dan **penguasaan kompetensi per materi** berdasarkan butir soal yang benar/salah, sehingga intervensi bisa tepat sasaran.

**B. Achievements Dashboard** — merekap prestasi siswa dari 5 sekolah: total dalam periode tertentu, per sekolah, per tingkat (internasional, nasional, provinsi, kota/kabupaten), per kategori (akademik/non-akademik), per peringkat, dan tren dari waktu ke waktu.

**Alur operasional yang harus didukung:** setiap pekan, admin sekolah cukup **mengunggah/menginput** data (nilai TO, jawaban per butir, log latihan pekanan, dan prestasi). Data prestasi dari tiap sekolah formatnya bisa berbeda-beda; sistem harus bisa **membaca, memetakan, menormalkan, dan memvalidasi** data tersebut sebelum masuk dashboard.

---

## 4. Tech Stack

Gunakan stack berikut kecuali ada alasan kuat (diskusikan dulu jika ingin mengubah):

- **Next.js (App Router) + TypeScript** (strict mode)
- **Tailwind CSS + shadcn/ui** untuk komponen; **Recharts** untuk grafik
- **Supabase**: PostgreSQL, Auth, Storage (file unggahan & bukti sertifikat), dan **Row Level Security**
- **Drizzle ORM** atau Prisma untuk skema & migrasi (pilih satu, catat alasannya)
- **Zod** untuk validasi semua input & hasil parsing
- **SheetJS (xlsx)** dan **PapaParse** untuk membaca Excel/CSV
- **Anthropic Claude API** (server-side saja) untuk ekstraksi data prestasi dari format bebas; model diatur lewat env var `ANTHROPIC_MODEL`
- **Vitest** untuk unit test (wajib untuk parser, normalisasi, dan rumus metrik); **Playwright** untuk satu-dua alur E2E kritis
- Deploy: Vercel + Supabase. **[ISI: konfirmasi target hosting]**

Simpan semua rahasia di `.env.local`; sediakan `.env.example`.

---

## 5. Identitas Visual (WAJIB mengikuti Brand Guidelines)

### 5.1 Logo
- Portal ini bersifat lintas jenjang, jadi gunakan **Logo Master** Sekolah Talenta Juara di header dan halaman login. Logo turunan (SD/SMP) hanya dipakai sebagai badge identitas sekolah di dalam dashboard.
- Brandmark = **simbol + logotype**, tidak boleh dipisah. Logotype selalu di **kanan** simbol.
- **Zona bersih**: sisakan ruang kosong minimal **1/3 tinggi simbol** di keempat sisi logo.
- **Dilarang**: mendistorsi, memutar, menambah outline, menambah shadow, mengganti font logotype, mengubah/menambah warna, mengubah komposisi, dan memakai versi negatif satu warna selain **putih**.
- **Logo Master memakai warna Biru Muda (`#00A7E1`)** — ini warna identitas institusi secara keseluruhan, berbeda dari merah (SD) dan biru tua (SMP). Dipakai di header portal dan halaman login.
- Aset logo (format PNG, latar transparan) sudah tersedia dan disimpan di `public/brand/`:

  | File | Keterangan |
  |---|---|
  | `logo-master-full.png` | Logo Master "SEKOLAH TALENTA JUARA" — simbol + logotype, biru muda. Pakai di header portal & halaman login. |
  | `logo-master-symbol.png` | Simbol saja (biru muda) — untuk favicon/avatar jika logotype tidak muat. |
  | `logo-master-negative-white.png` | Versi negatif putih — untuk dipakai di atas latar gelap/berwarna (mis. strip motif diagonal). |
  | `logo-sd-full.png` | Logo turunan SD (merah) — badge identitas untuk ketiga sekolah SD. |
  | `logo-sd-symbol.png` | Simbol saja SD (merah). |
  | `logo-sd-negative-white.png` | Versi negatif putih logo SD. |
  | `logo-smp-full.png` | Logo turunan SMP (biru tua) — badge identitas untuk kedua sekolah SMP. |
  | `logo-smp-symbol.png` | Simbol saja SMP (biru tua). |
  | `logo-smp-negative-white.png` | Versi negatif putih logo SMP. |

  File-file ini hanya berisi logo per **jenjang**, bukan per sekolah individual — gunakan logo jenjang yang sesuai (SD/SMP) sebagai badge identitas sekolah di dalam dashboard, dan tampilkan nama kota (mis. "SD Talenta Juara Bandung") sebagai teks terpisah di sebelah badge jika perlu membedakan antar-cabang. Jika kualitas raster PNG kurang tajam saat diperbesar (mis. favicon atau cetak laporan PDF), minta file vektor (SVG/AI) dari yayasan; jangan menggambar ulang logonya sendiri.

### 5.2 Warna
Jadikan design tokens (CSS variables + Tailwind theme):

| Token | Hex | Penggunaan |
|---|---|---|
| `brand-red` | `#ED1C24` | Warna identitas SD; aksen, highlight, elemen grafis |
| `brand-blue` | `#0E4E96` | Warna identitas SMP; warna aksi utama portal (tombol primer, link aktif) |
| `brand-sky` | `#00A7E1` | Warna identitas jenjang ketiga **[ISI: jenjang apa]** |
| `brand-gray` | `#4D4D4F` | Teks utama, ikon |
| `white` | `#FFFFFF` | Latar utama |

- Turunkan shade gelap dari warna utama untuk motif diagonal (misalnya merah tua ±`#B0232A`, biru tua ±`#1E3F7C`), dan tint terang untuk latar kartu/badge.
- **Aksesibilitas**: `#ED1C24` di atas putih tidak memenuhi kontras WCAG AA untuk teks kecil. Gunakan merah hanya untuk teks besar/tebal, ikon, dan elemen grafis; teks isi tetap `brand-gray`. Semua kombinasi teks–latar harus lolos AA.
- **Warna sekolah di grafik**: setiap sekolah punya warna berbasis jenjangnya. Jika dua sekolah berjenjang sama, bedakan dengan shade/tint yang jelas berbeda **dan** pola garis/marker, sehingga grafik tetap terbaca tanpa bergantung pada warna saja.
- Status kompetensi memakai skala semantik tersendiri (lihat 7.3), bukan warna sekolah.

### 5.3 Tipografi
- **Cabin** (Google Fonts) → headline, judul halaman, judul kartu, angka KPI besar.
- **Albert Sans** (Google Fonts) → subheadline, body, tabel, label, form.
- Muat via `next/font/google` dengan fallback `system-ui, sans-serif`.

### 5.4 Gaya Visual
- Bersih, profesional, banyak ruang putih, sesuai sistem komunikasi visual brand.
- **Motif khas brand**: bidang warna solid dengan potongan **segitiga diagonal** berwarna shade lebih gelap (seperti pada kop surat, kartu nama, dan banner). Gunakan secara hemat: strip di bagian bawah header, hero halaman login, dan aksen sudut kartu KPI. Jangan berlebihan sampai mengganggu keterbacaan data.
- Halaman login: Logo Master, tagline "Developing Capable Muslim Leaders", motif diagonal.
- Tidak ada shadow berat; gunakan border tipis dan radius kecil–sedang.
- Responsif: desktop adalah prioritas utama (manajemen), tetapi tablet dan ponsel harus tetap nyaman dibaca.

---

## 6. Pengguna & Hak Akses

| Peran | Akses |
|---|---|
| **Super Admin (Yayasan)** | Semua sekolah, kelola pengguna, master data, konfigurasi ambang & bobot |
| **Manajemen (Viewer)** | Lihat semua dashboard 5 sekolah, ekspor laporan; tidak bisa mengubah data |
| **Admin Sekolah** | Input/unggah data **hanya untuk sekolahnya**, lihat dashboard sekolahnya |
| **Guru/Wali Kelas** (opsional, fase akhir) | Lihat siswa di kelasnya dan kelola catatan intervensi |

- Terapkan pembatasan di **database (RLS)**, bukan hanya di UI.
- Data siswa adalah data anak di bawah umur: tidak ada halaman publik, semua rute butuh login, catat **audit log** untuk setiap create/update/delete/import, dan sediakan fitur ekspor yang hanya bisa diakses peran berwenang.

---

## 7. TKA Dashboard

### 7.1 Konsep Data TKA
- Mata pelajaran TKA: **Matematika** dan **Bahasa Indonesia**, berlaku untuk setiap jenjang (SD maupun SMP). Tetap buat **konfigurabel** di master data (tabel `subjects`), bukan hardcode, agar mudah ditambah di masa depan (mis. IPA, Bahasa Inggris) tanpa perubahan kode.
- **Kerangka kompetensi** berjenjang: `Mapel → Elemen/Materi → Sub-elemen/Submateri (= sub-kompetensi)`, mengikuti **Kerangka Asesmen TKA resmi dari Pusmendik Kemendikdasmen** (sumber: `pusmendik.kemendikdasmen.go.id/tka`). Gunakan struktur berikut sebagai **data seed awal** di tabel `competencies` (bisa ditambah/diedit lewat menu master data, tidak di-hardcode):

  **Matematika SD/MI** — elemen: Bilangan (sub: Bilangan Rasional), Geometri dan Pengukuran (sub: Objek Geometri; Pengukuran), Data (sub: Penyajian dan Penggunaan Data). Dimensi kompetensi yang diukur (dipakai sebagai `cognitive_level` atau tag tambahan, karena jenjang SD tidak memakai tabel level 1–3 seperti SMP): Pengetahuan matematika, Representasi matematis, Penalaran, Pemecahan masalah matematis, Koneksi matematis.

  **Matematika SMP/MTs** — elemen: Bilangan (sub: Bilangan Real), Aljabar (sub: Persamaan dan Pertidaksamaan Linier; Bentuk Aljabar; Fungsi; Barisan dan Deret), Geometri dan Pengukuran (sub: Objek Geometri; Transformasi Geometri; Pengukuran), Data dan Peluang (sub: Data; Peluang). `cognitive_level` memakai 3 level resmi: **Level 1 — Pengetahuan dan Pemahaman** (Menghitung, Memahami informasi, Mengelompokkan, Mengidentifikasi), **Level 2 — Aplikasi** (Memodelkan, Mengaplikasikan, Menginterpretasikan), **Level 3 — Penalaran** (Menganalisis, Memecahkan masalah, Mengevaluasi, Menyimpulkan, Melakukan generalisasi).

  **Bahasa Indonesia SD/MI** (fokus: membaca, teks informasi & teks fiksi) — kompetensi dipakai sebagai "elemen" dengan sub-kompetensi di bawahnya:
  - *Pemahaman Tekstual*: mengidentifikasi kosakata umum/khusus; mengidentifikasi objek berdasarkan kosakata; menyusun kembali informasi dalam bentuk ikhtisar/bagan; mengidentifikasi informasi tersurat.
  - *Pemahaman Inferensial*: menyimpulkan ide pokok/gagasan pendukung/amanat/tokoh/peristiwa/nilai; menyimpulkan perubahan sederhana pada objek/karakter/latar; menjelaskan makna ungkapan.
  - *Evaluasi dan Apresiasi*: menilai relevansi peristiwa dengan kehidupan sehari-hari; menilai kesesuaian antarunsur/antarinformasi; menyimpulkan respons emosional terhadap teks fiksi.

  **Bahasa Indonesia SMP/MTs** (struktur sama, kedalaman lebih tinggi):
  - *Pemahaman Tekstual*: mengidentifikasi istilah berbagai bidang; mengidentifikasi objek/latar berdasarkan kosakata; mengidentifikasi informasi penting tersurat; menyusun kerangka/bagan dari bagian penting teks.
  - *Pemahaman Inferensial*: menyimpulkan ide pokok/gagasan pendukung/tokoh/peristiwa/latar/nilai dalam & antarteks; menjelaskan kelogisan hubungan antarperistiwa/antargagasan/antarinformasi; memprediksi peristiwa; menjelaskan bahasa kias & citraan.
  - *Evaluasi dan Apresiasi*: menilai relevansi peristiwa dengan kehidupan sehari-hari; menilai kesesuaian/keakuratan unsur berdasarkan perbandingan antarteks; menyimpulkan respons emosional terhadap teks fiksi.

  Karena kerangka ini adalah milik Pusmendik (sumber resmi, bukan rahasia dagang), boleh dikutip apa adanya ke seed data. Saat admin mengunggah kisi-kisi TO sungguhan (Bagian 9.2), setiap nomor soal dipetakan ke salah satu sub-kompetensi di atas — inilah yang menjadi dasar heatmap penguasaan kompetensi di Bagian 7.2.
- **Kisi-kisi Try Out (blueprint)**: setiap TO memiliki daftar butir soal; setiap butir dipetakan ke satu sub-kompetensi (+ level kognitif & tingkat kesulitan opsional). Inilah dasar analisis "siswa bisa/tidak bisa di materi apa".
- **Hasil TO** bisa diinput dalam dua tingkat detail:
  1. **Per butir** (disarankan): matriks siswa × nomor soal berisi 1/0 atau jawaban (A/B/C/D) + kunci → sistem menghitung benar/salah.
  2. **Nilai total saja** (fallback): tetap masuk tren nilai, tetapi tidak menyumbang analisis kompetensi, dan diberi tanda di UI.
- **Log Latihan Pekanan**: per siswa per pekan per mapel (dan per sub-kompetensi jika ada): jumlah soal dikerjakan, jumlah benar.

### 7.2 Halaman & Visualisasi

**a. Ringkasan Jaringan (5 sekolah)**
- KPI: rata-rata nilai TO terakhir (dan perubahan vs TO sebelumnya), % siswa mencapai target, tingkat partisipasi TO, total soal latihan pekan ini, jumlah siswa berstatus "Perlu Intervensi".
- Grafik garis tren rata-rata nilai per sekolah per TO (per mapel).
- Distribusi nilai (histogram/box plot) per sekolah.
- **Heatmap kompetensi**: baris = sub-kompetensi, kolom = sekolah, isi = % penguasaan. Klik sel → daftar siswa yang lemah di kompetensi tersebut.
- Top 5 kompetensi terlemah di seluruh jaringan.
- Grafik volume latihan pekanan (soal dikerjakan & akurasi) per sekolah.

**b. Dashboard Sekolah**
- Semua komponen di atas tapi per kelas.
- Heatmap kelas × kompetensi.
- Tabel siswa: nama, kelas, nilai TO terakhir, perubahan, rata-rata akurasi latihan, kompetensi terlemah, status. Bisa diurutkan, difilter, dicari.

**c. Profil Siswa**
- Header: nama, NIS/NISN, sekolah, kelas, status keseluruhan.
- Grafik tren nilai tiap TO per mapel, dengan garis target.
- **Peta penguasaan kompetensi**: bar horizontal per sub-kompetensi berwarna sesuai status, plus indikator tren (naik/turun/stagnan).
- Grafik latihan pekanan: jumlah soal & akurasi per pekan.
- Riwayat butir yang salah per TO (dikelompokkan per kompetensi).
- **Rekomendasi fokus intervensi**: 3 kompetensi prioritas berdasarkan penguasaan rendah + data cukup + bobot kompetensi di kisi-kisi.
- Catatan intervensi (siapa, kapan, tindakan, hasil) dengan status: Direncanakan / Berjalan / Selesai.

**d. Kelompok Intervensi**
- Otomatis mengelompokkan siswa per kompetensi lemah (lintas kelas dalam satu sekolah), sehingga guru bisa membuat kelas remedial terarah.
- Ekspor daftar kelompok ke Excel/PDF.

**e. Perbandingan TO**
- Bandingkan dua TO: perubahan nilai per siswa, siswa paling meningkat/menurun, perubahan penguasaan per kompetensi.

### 7.3 Rumus & Aturan (buat konfigurabel di menu Pengaturan)
- **Penguasaan kompetensi** = jumlah benar ÷ jumlah butir yang dikerjakan pada kompetensi tersebut, menggabungkan TO dan latihan pekanan dengan bobot konfigurabel (default: TO 70%, latihan 30%) dan **bobot keterkinian** (data 4 pekan terakhir lebih berat).
- **Minimal data**: jika butir pada suatu kompetensi < 5 (konfigurabel), tampilkan "Data belum cukup", jangan beri status.
- **Status penguasaan** (default, bisa diubah):
  - < 50% → **Perlu Intervensi**
  - 50–69% → **Berkembang**
  - 70–84% → **Cakap**
  - ≥ 85% → **Mahir**
- **Target nilai TO** default: **Matematika = 70** dan **Bahasa Indonesia = 85**, berlaku sama untuk kelima sekolah. Simpan sebagai data di tabel `settings`/per-mapel (bukan hardcode), dan tetap sediakan menu Pengaturan untuk mengubahnya per sekolah per mapel di kemudian hari jika yayasan ingin membedakan target antar-cabang.
- **Siswa berisiko**: nilai di bawah target pada 2 TO berturut-turut **atau** penurunan > 10 poin vs TO sebelumnya (konfigurabel).
- Tulis semua rumus sebagai fungsi murni di `lib/metrics/` dengan unit test lengkap, termasuk kasus tepi (siswa absen, butir dianulir, TO tanpa kisi-kisi).

---

## 8. Achievements Dashboard

### 8.1 Atribut Prestasi (hasil normalisasi)

Yayasan sudah punya **template standar** (`Ringkasan_Prestasi_2026_Template_Standar.xlsx`, disertakan di `docs/templates/` — lihat Bagian 9.2) yang mendefinisikan taksonomi baku berikut. Pakai persis nilai-nilai ini sebagai enum, jangan diubah strukturnya:

- **Tanggal** prestasi (bukan tanggal input), format `DD/MM/YYYY` atau `YYYY-MM-DD` — tahun ajaran, semester, dan pekan (ISO week) dihitung otomatis dari tanggal ini.
- **Sekolah**: diisi dengan `school_code` (mis. `SDTJBDG`, `SDTJCMH`, `SDTJPKU`, `SMPTJBDG`, `SMPTJPKU`), bukan nama panjang.
- **Nama Siswa/Tim**: satu nama atau beberapa nama dipisah koma untuk tim.
- **Nama Lomba**: nama kegiatan/kompetisi apa adanya.
- **Kategori** (flat, 6 nilai baku, *bukan* nested Akademik/Non-Akademik + sub-kategori): `AKADEMIK`, `NON_AKADEMIK`, `OLAHRAGA`, `SENI_BUDAYA`, `TEKNOLOGI`, `LAINNYA`.
- **Tingkat**: `KOTA_KABUPATEN`, `PROVINSI`, `NASIONAL`, `INTERNASIONAL` (boleh kosong jika memang tidak diketahui — jangan dipaksa menebak).
- **Peringkat**: `JUARA_1`, `JUARA_2`, `JUARA_3`, `MEDALI_EMAS`, `MEDALI_PERAK`, `MEDALI_PERUNGGU`, `HARAPAN`, `FINALIS` (boleh kosong).
- **Penyelenggara**: nama lembaga/panitia penyelenggara.
- **Link Bukti**: URL sertifikat/dokumentasi (opsional).
- **Catatan**: kolom bebas, **wajib dipakai sebagai fallback** ketika hasil asli tidak punya padanan persis di daftar Peringkat baku (contoh nyata dari data yayasan: "Medali Partisipasi" atau "Piagam Peserta Aktif" ditulis apa adanya di Catatan dengan Peringkat dikosongkan, bukan dipaksakan ke salah satu enum yang salah). Catatan juga dipakai untuk info kelas (mis. "Kelas: 5A") dan keterangan tanggal perkiraan.
- Jenis peserta (Individu/Tim) **disimpulkan otomatis** dari jumlah nama di kolom Nama Siswa/Tim, tidak perlu kolom terpisah.

Sheet kedua di file template, **"Referensi"**, berisi daftar master `Kode Sekolah ↔ Nama Sekolah`, serta contoh nilai Kategori/Tingkat/Peringkat — pakai sebagai acuan tabel lookup/enum di database, dan tampilkan sebagai dropdown bantuan di form input manual (Bagian 9.4).

### 8.2 Halaman & Visualisasi
- KPI periode terpilih: total prestasi, total siswa berprestasi (unik), jumlah prestasi tingkat nasional + internasional, perbandingan dengan periode yang sama tahun lalu.
- Bar bertumpuk: prestasi per sekolah × tingkat.
- Donut: Akademik vs Non-Akademik; bar per sub-kategori/bidang.
- Tren bulanan/pekanan (kumulatif dan per periode).
- Matriks sekolah × tingkat (tabel angka, bisa diklik).
- **Poin Prestasi** (opsional, bobot konfigurabel per tingkat × peringkat) untuk peringkat antarsekolah yang adil.
- Feed prestasi terbaru dengan badge sekolah.
- Daftar siswa dengan prestasi terbanyak.
- Filter: periode, sekolah, tingkat, kategori, bidang, peringkat, individu/tim.
- Ekspor rekap ke Excel dan PDF (untuk laporan manajemen).

---

## 9. Input Data Pekanan (fitur paling penting)

### 9.1 Pusat Input ("Input Pekanan")
Satu halaman berisi kartu tugas pekan berjalan per sekolah: TO (jika ada), log latihan pekanan, dan prestasi, lengkap dengan status **Belum / Sebagian / Lengkap** dan siapa yang terakhir mengunggah. Manajemen bisa melihat sekolah mana yang belum input.

### 9.2 Template Resmi
Sediakan template Excel yang bisa diunduh dari aplikasi (dibuat dengan SheetJS, ada sheet petunjuk dan dropdown validasi):
1. `Template_Kisi_TO.xlsx` — nomor soal, mapel, sub-kompetensi, level kognitif, kunci jawaban
2. `Template_Hasil_TO.xlsx` — NIS, nama, kelas, lalu kolom nomor soal 1..n
3. `Template_Latihan_Pekanan.xlsx` — NIS, nama, pekan, mapel, sub-kompetensi (opsional), jumlah dikerjakan, jumlah benar
4. `Template_Prestasi.xlsx` — **sudah ada**: salin struktur dari `Ringkasan_Prestasi_2026_Template_Standar.xlsx` yang disertakan yayasan (sheet `Data Prestasi` dengan 10 kolom sesuai Bagian 8.1, plus sheet `Referensi` berisi kode sekolah dan daftar enum baku). Jadikan ini **format kanonik/target** — hasil normalisasi dari Smart Import (Bagian 9.3) harus selalu bisa dipetakan ke struktur persis ini sebelum disimpan ke tabel `achievements`.

### 9.3 Smart Import (untuk format yang berbeda-beda)
Alur wajib, berlaku untuk semua jenis impor:

1. **Unggah**: `.xlsx`, `.xls`, `.csv`, tempel teks (misal rekap dari WhatsApp), PDF, atau foto sertifikat/rekap.
2. **Deteksi struktur**: cari baris header otomatis, abaikan baris judul/kosong/merged cells, deteksi beberapa sheet.
3. **Pemetaan kolom otomatis** dengan kamus sinonim + fuzzy matching. Contoh: "Nama Lomba / Kegiatan / Event / Kompetisi" → `competition_name`; "Tingkat / Level / Skala" → `level`; "Juara / Peringkat / Hasil / Capaian" → `rank`. Tampilkan hasil pemetaan dan biarkan pengguna mengoreksi lewat dropdown.
4. **Normalisasi nilai** ke enum baku di Bagian 8.1: contoh "Kab.", "Kota", "Kab/Kota", "Kabupaten" → `KOTA_KABUPATEN`; "Intl", "International" → `INTERNASIONAL`; "Juara I", "Juara 1", "1st" → `JUARA_1`; "Gold", "Emas" → `MEDALI_EMAS`; "Sains", "Robotik", "Matematika" (nama bidang) → `AKADEMIK` atau `TEKNOLOGI` tergantung konteks; berbagai format tanggal Indonesia ("12 Nov 2026", "12/11/26") → ISO. **Jika hasil asli tidak punya padanan persis** (contoh nyata: "Medali Partisipasi", "Piagam Peserta Aktif") — **jangan dipaksakan** ke enum terdekat yang salah; kosongkan kolom Peringkat/Kategori dan tulis apa adanya di kolom Catatan, lalu tandai baris tersebut di pratinjau agar pengguna sadar dan bisa memutuskan sendiri.
5. **Ekstraksi AI (fallback)** untuk teks bebas, PDF, dan gambar: kirim ke Claude API di server dengan **skema JSON ketat** (validasi Zod), minta nilai `confidence` per field. Hasil AI **tidak pernah langsung tersimpan**.
6. **Pencocokan siswa**: cocokkan ke master siswa via NIS/NISN; jika hanya nama, gunakan fuzzy match dalam sekolah yang sama dan minta konfirmasi bila tidak pasti.
7. **Pratinjau & validasi**: tabel pratinjau dengan baris bermasalah ditandai (kolom wajib kosong, nilai tidak dikenali, siswa tidak ditemukan, **duplikat** — siswa + lomba + tanggal sama). Pengguna bisa edit langsung di tabel.
8. **Simpan sebagai batch**: setiap impor tercatat (file asli di Storage, pemetaan, pengunggah, waktu, jumlah baris). Batch bisa **dibatalkan (rollback)** oleh Super Admin.
9. **Profil pemetaan per sekolah**: simpan pemetaan yang sudah dikonfirmasi, sehingga file sekolah yang sama pada pekan berikutnya langsung terpetakan otomatis.

Privasi untuk ekstraksi AI: kirim hanya konten yang diperlukan, sediakan **saklar untuk menonaktifkan fitur AI** di Pengaturan, dan jelaskan di UI bahwa file diproses oleh layanan pihak ketiga.

### 9.4 Input Manual
Form input cepat untuk satu prestasi atau koreksi satu nilai, dengan autocomplete siswa.

---

## 10. Model Data (titik awal, boleh disempurnakan)

```
schools(id, school_code[unique, mis. SDTJBDG], name, level[sd|smp|…], city, brand_color, logo_path)
academic_years(id, label, start_date, end_date, is_active)
classes(id, school_id, academic_year_id, name, grade)
students(id, school_id, nis, nisn, full_name, gender, current_class_id, is_active)
subjects(id, name, level)
competencies(id, subject_id, parent_id, code, name, depth)
tryouts(id, name, date, academic_year_id, level, subject_id, is_network_wide)
tryout_items(id, tryout_id, number, competency_id, cognitive_level, difficulty, answer_key, is_voided)
tryout_scores(id, tryout_id, student_id, raw_score, scaled_score, status[present|absent])
item_responses(id, tryout_id, item_id, student_id, answer, is_correct)
practice_logs(id, student_id, week_start, subject_id, competency_id?, attempted, correct)
interventions(id, student_id, competency_id?, owner_user_id, action, status, notes, started_at, ended_at)
achievements(id, school_id, achieved_on, competition_name, organizer,
             category[akademik|non_akademik|olahraga|seni_budaya|teknologi|lainnya],
             level[kota_kabupaten|provinsi|nasional|internasional]?,
             rank[juara_1|juara_2|juara_3|medali_emas|medali_perak|medali_perunggu|harapan|finalis]?,
             evidence_url, notes, import_batch_id)
             -- participant_type (individu/tim) disimpulkan dari jumlah baris achievement_students, tidak disimpan terpisah
achievement_students(achievement_id, student_id)
import_batches(id, school_id, type, file_path, mapping_json, status, row_count, created_by, created_at)
mapping_profiles(id, school_id, type, mapping_json)
settings(key, value_json)             -- ambang status, bobot, target, poin prestasi
users/profiles(id, role, school_id?)
audit_logs(id, user_id, action, entity, entity_id, diff_json, created_at)
```

Buat index pada kolom yang sering difilter (school_id, tryout_id, student_id, week_start, achieved_on). Pertimbangkan **materialized view** atau tabel agregat untuk heatmap kompetensi dan rekap prestasi, dengan refresh setelah setiap impor.

---

## 11. Fase Pengembangan & Kriteria Selesai

**Fase 0 — Rencana**: ringkas pemahamanmu, usulkan struktur folder, skema final, daftar halaman, dan ajukan pertanyaan klarifikasi. Tunggu persetujuan.

**Fase 1 — Fondasi**: setup project, design tokens, font, layout (sidebar + header dengan Logo Master), auth Supabase, peran & RLS, halaman login bermotif brand, master data (sekolah, tahun ajaran, kelas, siswa, mapel, kompetensi), seed dummy (5 sekolah, ±60 siswa per sekolah, 4 TO, 8 pekan latihan, ±80 prestasi).
*Selesai jika*: login per peran berfungsi, admin sekolah A tidak bisa melihat data sekolah B (diuji).

**Fase 2 — Input TKA**: template unduhan, impor kisi-kisi, hasil TO per butir dan nilai total, log latihan pekanan, pratinjau & validasi, batch & rollback.
*Selesai jika*: file template contoh dan file dengan header berantakan sama-sama bisa diimpor dengan benar.

**Fase 3 — TKA Dashboard**: semua halaman di 7.2 + rumus di 7.3 dengan unit test.
*Selesai jika*: angka di dashboard cocok dengan perhitungan manual pada data seed.

**Fase 4 — Achievements**: smart import (termasuk ekstraksi AI), input manual, dashboard 8.2, ekspor.
*Selesai jika*: tiga file contoh dengan format berbeda (rapi, berantakan, teks tempel) berhasil dinormalkan dengan benar setelah konfirmasi.

**Fase 5 — Penyempurnaan**: Pusat Input Pekanan, ekspor PDF laporan manajemen, empty state, loading skeleton, pesan error yang manusiawi, audit log viewer, uji aksesibilitas & responsif, dokumentasi.

---

## 12. Standar Kualitas UX

- Setiap grafik punya judul yang jelas, keterangan periode, dan tooltip angka.
- Empty state yang membantu (misal: "Belum ada data TO untuk periode ini. Unggah hasil TO →").
- Loading skeleton, bukan spinner layar penuh.
- Pesan error dalam bahasa awam, misalnya "Kolom NIS tidak ditemukan di baris 12" — bukan stack trace.
- Format angka & tanggal Indonesia (`1.234`, `12 Nov 2026`).
- Filter global (tahun ajaran, sekolah, periode) tersimpan di URL agar tautan dashboard bisa dibagikan antaranggota manajemen.
- Navigasi keyboard dan label ARIA pada komponen interaktif.

---

## 13. Dokumentasi yang Harus Dihasilkan

- `README.md`: cara setup lokal, env, migrasi, seed, deploy.
- `docs/PANDUAN_ADMIN.md`: panduan input pekanan untuk admin sekolah, bahasa nonteknis, langkah demi langkah.
- `docs/DECISIONS.md`: catatan keputusan teknis.
- `docs/METRICS.md`: penjelasan setiap rumus metrik dalam bahasa yang dipahami manajemen.

---

## 14. Informasi yang Masih Perlu Dilengkapi

- [x] Nama, jenjang, dan kota 5 sekolah
- [x] File Logo Master dan logo turunan (PNG tersedia di `public/brand/`; minta versi SVG/vektor jika perlu kualitas cetak tinggi)
- [x] Jenjang yang memakai warna Biru Muda `#00A7E1` — ini warna Logo Master (identitas institusi), bukan warna jenjang
- [x] Mata pelajaran TKA: Matematika & Bahasa Indonesia untuk semua jenjang
- [x] Kerangka kompetensi/kisi-kisi per mapel — diambil dari Kerangka Asesmen TKA resmi Pusmendik, sudah dituliskan lengkap di Bagian 7.1
- [x] Template standar prestasi (`Ringkasan_Prestasi_2026_Template_Standar.xlsx`) sudah ada dan jadi acuan taksonomi di Bagian 8.1 — namun ini format **sudah rapi/standar**, bukan contoh mentah dari tiap sekolah. **Masih disarankan** mengumpulkan 2–3 contoh file rekap prestasi dalam format **asli/mentah** (sebelum dirapikan ke template ini) dari masing-masing sekolah, supaya Smart Import (Bagian 9.3) benar-benar teruji menghadapi format yang berantakan/berbeda-beda seperti yang disebutkan di awal
- [x] Target nilai TO: Matematika = 70, Bahasa Indonesia = 85, berlaku untuk semua sekolah (ambang status penguasaan kompetensi dan bobot poin prestasi masih pakai default di Bagian 7.3 & 8.2, bisa diubah lewat Pengaturan)
- [ ] Target hosting dan domain
