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
