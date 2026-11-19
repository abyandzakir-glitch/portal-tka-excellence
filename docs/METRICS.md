# Penjelasan Rumus Metrik

Dokumen ini menjelaskan cara portal menghitung setiap angka di dashboard, dengan bahasa sehari-hari. Rumus lain (penguasaan kompetensi, status, siswa berisiko, poin prestasi) ditambahkan saat dashboardnya selesai dibuat.

---

## Nilai Try Out

**Nilai = jumlah soal yang dijawab benar ÷ jumlah soal yang dihitung × 100**

- **Soal yang dianulir** (dibatalkan) tidak dihitung sama sekali: tidak menambah jumlah benar dan tidak menambah jumlah soal. Contoh: TO berisi 30 soal dan 1 soal dianulir. Siswa yang benar 26 dari 29 soal lainnya mendapat nilai 26 ÷ 29 × 100 = **89,66**.
- **Soal yang tidak dijawab** dihitung salah.
- Nilai dibulatkan 2 angka di belakang koma, dengan rentang 0–100.
- **Siswa absen** (semua jawaban kosong, atau ditandai tidak hadir) tidak mendapat nilai dan tidak ikut dihitung dalam rata-rata.
- Kalau sekolah hanya mengunggah **nilai total** tanpa jawaban per soal, nilai itu dipakai apa adanya. Nilai tersebut tetap masuk grafik perkembangan, tetapi tidak dipakai untuk analisis kompetensi.
- Kalau penyelenggara TO memberikan **nilai skala** (nilai terstandar), nilai skala itulah yang dibandingkan dengan target. Kalau tidak ada, yang dipakai adalah nilai di atas.
- Kalau kunci jawaban diralat atau ada soal yang dianulir setelah hasil diunggah, semua nilai TO tersebut **dihitung ulang otomatis**.

**Target nilai** (bisa diubah di Pengaturan): Matematika **70**, Bahasa Indonesia **85**, sama untuk kelima sekolah.

Rumus di kode: `lib/metrics/tryout-score.ts`.

---

## Penguasaan Kompetensi

Penguasaan menunjukkan seberapa sering siswa menjawab benar soal-soal pada satu sub-kompetensi, dihitung dari **try out** dan **latihan pekanan**.

1. **% benar try out** = soal benar ÷ soal pada kompetensi itu. Soal yang tidak dijawab dihitung salah, dan soal yang dianulir tidak dihitung.
2. **% benar latihan** = jumlah benar ÷ jumlah dikerjakan, hanya dari latihan yang mencantumkan sub-kompetensi. Latihan campuran hanya masuk ke grafik volume dan akurasi.
3. Di dalam masing-masing sumber, **data 4 pekan terakhir berbobot 2×**, supaya kemajuan terbaru lebih terlihat. "4 pekan terakhir" dihitung mundur dari akhir periode yang dipilih di filter (bawaan: hari ini).
4. **Penguasaan = 70% × (% benar TO) + 30% × (% benar latihan).** Kalau salah satu sumber belum punya data, sumber yang ada dipakai 100%.

**Contoh.** Seorang siswa menjawab 8 dari 10 soal TO dengan benar (semuanya lebih dari 4 pekan lalu), dan dari latihan pekan ini benar 5 dari 10. Hasilnya: 70% × 80% + 30% × 50% = **71% → Cakap**.

**Status penguasaan** (bisa diubah di Pengaturan):

| Penguasaan | Status |
|---|---|
| di bawah 50% | Perlu Intervensi |
| 50% – di bawah 70% | Berkembang |
| 70% – di bawah 85% | Cakap |
| 85% ke atas | Mahir |
| kurang dari 5 soal (TO + latihan) | Data belum cukup (tanpa status) |

**Sekolah dan kelas** dihitung dengan menggabungkan semua soal siswanya (total benar ÷ total soal, dengan bobot yang sama), bukan dengan merata-ratakan persen per siswa. Cara ini membuat siswa yang datanya sedikit tidak terlalu memengaruhi hasil.

**Tren** (naik/turun/stagnan) membandingkan penguasaan dari data 4 pekan terakhir dengan data sebelumnya. Hasilnya "naik" atau "turun" kalau selisihnya minimal 5 poin persen, dan hanya kalau kedua bagian datanya cukup.

---

## Status Siswa

- **Status per mapel** = status penguasaan atas seluruh soal mapel itu.
- **Status keseluruhan** = status terendah dari semua mapel. Contoh: Matematika Cakap dan Bahasa Indonesia Berkembang → keseluruhan **Berkembang**.
- **Berisiko** (penanda terpisah, dari nilai TO per mapel):
  - nilai di bawah target pada **2 TO terakhir yang diikuti** berturut-turut, **atau**
  - nilai turun **lebih dari 10 poin** dibandingkan TO sebelumnya.

  TO yang tidak diikuti (absen) dilewati. Kedua angka bisa diubah di Pengaturan.
- **"Siswa perlu intervensi"** di kartu KPI = siswa yang berstatus Perlu Intervensi **atau** Berisiko.

---

## Kartu KPI

| KPI | Cara menghitung |
|---|---|
| Rata-rata nilai TO terakhir | Untuk setiap sekolah diambil TO terakhir yang diikutinya pada mapel dan periode terpilih, lalu dirata-rata dari semua siswa yang hadir. |
| Perubahan | Rata-rata TO terakhir dikurangi rata-rata TO sebelumnya. |
| Siswa mencapai target | Siswa hadir dengan nilai ≥ target sekolahnya ÷ siswa hadir. |
| Partisipasi | Siswa yang hadir ÷ siswa aktif di sekolah peserta TO tersebut. |
| Soal latihan pekan ini | Jumlah soal latihan pada pekan (Senin–Minggu) yang memuat akhir periode. |

---

## Rekomendasi Fokus Intervensi

Untuk setiap siswa dipilih **3 sub-kompetensi** dengan skor tertinggi:

**skor = (1 − penguasaan) × porsi soal kompetensi itu di kisi-kisi TO dalam periode**

Kompetensi yang penguasaannya rendah **dan** sering diujikan muncul paling atas. Kompetensi dengan data belum cukup atau yang sudah Mahir tidak direkomendasikan.

---

## Prestasi

| Angka | Cara menghitung |
|---|---|
| **Total prestasi** | Jumlah prestasi dengan tanggal prestasi (bukan tanggal input) di dalam periode terpilih. |
| **Siswa berprestasi (unik)** | Jumlah siswa berbeda. Siswa yang cocok dengan data siswa dihitung per orang. Nama yang belum cocok dihitung per nama tertulis di sekolahnya. Prestasi tanpa nama siswa tidak ikut dihitung di sini. |
| **Nasional & internasional** | Prestasi bertingkat Nasional atau Internasional. |
| **Dibandingkan tahun lalu** | Angka yang sama pada tanggal-tanggal yang sama satu tahun sebelumnya. |
| **Akademik vs Non-Akademik** | Akademik = kategori Akademik + Teknologi (bawaan). Pengelompokan ini bisa diubah Super Admin di menu Pengaturan. Prestasi tanpa kategori ditampilkan terpisah. |
| **Individu / Tim** | Ditentukan dari jumlah nama: 1 nama = individu, lebih dari 1 = tim. |

**Poin Prestasi** = bobot tingkat × bobot peringkat. Poin dipakai agar perbandingan antarsekolah lebih adil daripada sekadar jumlah.

| Tingkat | Bobot | | Peringkat | Bobot |
|---|---|---|---|---|
| Kota/Kabupaten | 1 | | Juara 1 / Medali Emas | 5 |
| Provinsi | 2 | | Juara 2 / Medali Perak | 4 |
| Nasional | 4 | | Juara 3 / Medali Perunggu | 3 |
| Internasional | 6 | | Harapan | 2 |
| Tidak diketahui | 1 | | Finalis | 1 |
| | | | Tanpa peringkat baku | 0,5 |

Contoh: Juara 1 tingkat Nasional = 4 × 5 = **20 poin**. Medali Partisipasi tingkat Kota = 1 × 0,5 = **0,5 poin**. Bobot di atas adalah bawaan dan bisa diubah Super Admin di menu Pengaturan.

---

## Kelengkapan Input Pekanan

Halaman Input Pekanan dan Laporan Manajemen menilai kelengkapan data setiap sekolah per pekan (Senin–Minggu, WIB).

- **Siswa yang diharapkan** = siswa aktif kelas 6 (SD) atau kelas 9 (SMP) pada tahun ajaran aktif.
- **Latihan pekanan**: *Lengkap* bila setiap siswa yang diharapkan punya minimal satu catatan latihan pada pekan itu; *Sebagian* bila baru sebagian; *Belum* bila belum ada.
- **Hasil TO**: dinilai untuk setiap TO sekolah itu yang dilaksanakan **pekan ini atau pekan lalu**. *Lengkap* bila setiap siswa yang diharapkan punya baris nilai (hadir atau tidak hadir) dan siswa yang hadir punya jawaban per butir; *Sebagian* bila baru sebagian siswa, atau hanya nilai total; *Belum* bila belum ada. Pekan tanpa TO tidak dihitung.
- **Prestasi** tidak termasuk kelengkapan pekanan (pekan tanpa lomba itu wajar); prestasi dikelola dari dashboard Prestasi.
- **Status sekolah**: *Lengkap* bila semua yang dihitung Lengkap; *Belum* bila semuanya Belum; selain itu *Sebagian*.
- **Ringkasan di atas kartu** (mengikuti saringan SD/SMP): *Sekolah lengkap* = jumlah sekolah berstatus Lengkap dari sekolah yang punya sesuatu untuk dinilai; *Hasil try out masuk* = baris nilai yang masuk ÷ (siswa yang diharapkan × jumlah TO yang jatuh tempo), dijumlah lintas sekolah; *Latihan pekanan masuk* = siswa yang punya catatan latihan ÷ siswa yang diharapkan.

Rumus di kode: `lib/metrics/mastery.ts`, `lib/metrics/risk.ts`, `lib/metrics/tryout-kpi.ts`, `lib/metrics/recommend.ts`, `lib/metrics/achievements.ts`, `lib/metrics/input-status.ts`. Kecocokan angka dashboard dengan perhitungan manual diuji otomatis (`tests/integration/tka-metrics.test.ts`).
