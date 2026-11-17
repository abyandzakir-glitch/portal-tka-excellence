# Panduan Input Pekanan untuk Admin Sekolah

Panduan ini menjelaskan cara memasukkan data TKA sekolah Anda ke Portal Academic Excellence setiap pekan. Anda tidak perlu keahlian teknis: cukup file Excel atau CSV.

> Bagian input **prestasi** akan ditambahkan setelah fiturnya tersedia.

---

## Yang perlu diunggah

| Data | Kapan | Siapa |
|---|---|---|
| **Kisi-kisi Try Out** | Sekali, sebelum hasil TO diunggah | Super Admin yayasan untuk TO bersama; Anda untuk TO khusus sekolah Anda |
| **Hasil Try Out** | Setelah setiap TO | Admin sekolah |
| **Latihan Pekanan** | Setiap pekan | Admin sekolah |

Semua dilakukan di menu **Input Pekanan**.

---

## Langkah umum (berlaku untuk semua jenis data)

### 1. Pilih jenis data
Buka **Input Pekanan**, lalu klik kartu *Hasil Try Out*, *Latihan Pekanan*, atau *Kisi-kisi Try Out*.

### 2. Isi pilihan dan unduh template
Isi pilihan di bagian **1. Pilih data** (misalnya try out mana). Tautan **Unduh template** lalu muncul di bagian **2. Siapkan file**.

- Template hasil TO dan latihan pekanan **sudah berisi daftar siswa** sekolah Anda. Jangan ubah kolom NIS.
- Setiap template punya sheet **Petunjuk** dan pilihan *dropdown* pada kolom tertentu.

**Tidak wajib memakai template.** Kalau sekolah Anda sudah punya rekap sendiri, unggah saja. Portal akan mencoba mengenali kolom-kolomnya.

### 3. Unggah file
Pilih file (.xlsx, .xls, atau .csv, maksimal 5 MB), lalu klik **Unggah & periksa**. Pada tahap ini data **belum tersimpan**.

### 4. Periksa pemetaan kolom
Di halaman pratinjau, bagian **Pemetaan kolom** menunjukkan bagaimana tiap kolom di file Anda dibaca. Contohnya, kolom "No. Induk" dibaca sebagai *NIS*.

- Kalau ada yang keliru, klik **Periksa / ubah**, pilih jenis data yang benar di dropdown, lalu klik **Terapkan & periksa ulang**.
- Kolom yang tidak perlu (misalnya "Paraf Guru") biarkan **— Abaikan —**.
- Kalau judul kolom file Anda tidak berada di baris pertama, pilih baris yang benar di **Baris judul kolom**.

Portal **mengingat** pemetaan yang sudah Anda konfirmasi. Pekan depan, file dengan susunan kolom yang sama langsung terbaca dengan benar.

### 5. Periksa pratinjau
Setiap baris diberi status:

| Status | Arti | Yang perlu dilakukan |
|---|---|---|
| ✅ **Siap** | Data terbaca dengan benar | Tidak ada |
| ⚠️ **Perlu dicek** | Bisa disimpan, tetapi ada hal yang perlu Anda pastikan (misalnya nama siswa dicocokkan karena mirip, atau siswa dicatat absen) | Baca keterangannya. Kalau keliru, klik **Ubah** |
| ⛔ **Bermasalah** | Tidak bisa disimpan (misalnya NIS tidak ditemukan atau jumlah benar lebih besar dari jumlah soal) | Klik **Ubah** untuk membetulkan, atau perbaiki di file lalu unggah ulang |
| ➖ **Dilewati** | Baris kosong, baris "Jumlah"/"Rata-rata", atau baris tanpa soal dikerjakan | Tidak ada |

Gunakan tombol **Perlu perhatian** di atas tabel untuk hanya melihat baris yang perlu dicek dan yang bermasalah.

Perubahan lewat tombol **Ubah** hanya berlaku untuk unggahan ini. File asli Anda tidak berubah.

### 6. Simpan
Kalau ada baris *Perlu dicek*, centang **Saya sudah memeriksa …**, lalu klik **Simpan**. Baris *Bermasalah* tidak ikut disimpan.

Kalau Anda batal, klik **Hapus draf**. Tidak ada data yang berubah.

### 7. Riwayat
Semua unggahan tercatat di **Riwayat unggahan** pada halaman Input Pekanan, lengkap dengan status, pengunggah, dan file aslinya.

---

## Hasil Try Out

- Isi jawaban per nomor soal dengan **huruf pilihan (A–E)** *atau* **1 (benar) / 0 (salah)**. Pakai salah satu cara untuk seluruh file.
- Soal yang **tidak dijawab**: biarkan kosong. Soal itu dihitung salah.
- Siswa yang **tidak ikut** TO: kosongkan semua jawabannya, atau isi kolom Kehadiran dengan "Tidak Hadir".
- Kalau Anda **hanya punya nilai total**, buat kolom "Nilai" tanpa kolom nomor soal. Nilai tetap masuk ke grafik perkembangan, tetapi tidak bisa dipakai untuk melihat kompetensi mana yang lemah.
- **Mengunggah ulang** hasil untuk TO yang sama (misalnya untuk koreksi) akan **menggantikan** seluruh data hasil TO itu untuk sekolah Anda. Data lama tetap tersimpan sebagai cadangan dan bisa dipulihkan oleh Super Admin.

## Latihan Pekanan

- Satu baris = satu siswa, satu pekan, satu mapel. Kalau ada, tambahkan juga sub-kompetensinya.
- Kolom **Pekan**: tulis tanggal mana saja di pekan itu (misalnya 12/11/2026). Portal otomatis memakai hari Senin pekan tersebut. Kalau file Anda tidak punya kolom tanggal, pilih pekannya di formulir unggah.
- **Sub-kompetensi** boleh kosong kalau latihannya campuran. Data tetap dihitung untuk jumlah soal dan akurasi.
- Kalau file Anda mencatat **jumlah salah** (bukan jumlah benar), itu juga bisa dibaca.
- Mengunggah data untuk siswa, pekan, dan mapel yang sama akan **menggantikan** data sebelumnya. Pratinjau memberi tahu berapa baris yang akan diganti.

## Kisi-kisi Try Out

- Satu baris = satu nomor soal. Pilih **Sub-kompetensi** dari dropdown di template.
- **Kunci jawaban** boleh kosong kalau hasil TO nanti diunggah dalam format 1/0.
- Soal yang **dibatalkan** (dianulir): isi "Ya" di kolom Dianulir. Soal itu tidak dihitung dalam nilai maupun penguasaan kompetensi.
- Kunci jawaban yang diralat atau soal yang dianulir **setelah** hasil TO diunggah: pilih **Perbarui kisi-kisi try out yang sudah ada**. Nilai siswa akan dihitung ulang secara otomatis.

---

## Pertanyaan yang sering muncul

**"NIS … tidak ditemukan di data siswa sekolah ini."**
Siswa tersebut belum ada di data master, atau NIS-nya salah ketik. Periksa saran nama yang muncul di keterangan. Kalau siswa memang baru, minta Super Admin menambahkannya ke data master, lalu unggah ulang.

**"Ada 2 siswa bernama …"**
Isi kolom NIS supaya portal tahu siswa yang dimaksud.

**Saya salah menyimpan data.**
Unggah ulang file yang benar. Untuk hasil TO dan latihan pekanan, data baru menggantikan data lama. Kalau perlu membatalkan sebuah unggahan sepenuhnya, hubungi Super Admin yayasan.

**File saya tidak terbaca sama sekali.**
Pastikan formatnya .xlsx, .xls, atau .csv dan tidak dilindungi kata sandi. Kalau masih gagal, salin datanya ke template resmi.
