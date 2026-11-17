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

Rumus di kode: `lib/metrics/mastery.ts`, `lib/metrics/risk.ts`, `lib/metrics/tryout-kpi.ts`, `lib/metrics/recommend.ts`. Kecocokan angka dashboard dengan perhitungan manual diuji otomatis (`tests/integration/tka-metrics.test.ts`).
