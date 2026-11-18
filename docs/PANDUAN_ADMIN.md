# Panduan Input Pekanan untuk Admin Sekolah

Panduan ini menjelaskan cara memasukkan data TKA sekolah Anda ke Portal Academic Excellence setiap pekan. Anda tidak perlu keahlian teknis: cukup file Excel atau CSV.

Untuk **prestasi**, lihat bagian [Prestasi](#prestasi). Untuk **data siswa dan kelas**, lihat [Data siswa dan kelas](#data-siswa-dan-kelas). Tugas khusus **Super Admin** ada di [bagian akhir](#khusus-super-admin-yayasan).

---

## Yang perlu diunggah

| Data | Kapan | Siapa |
|---|---|---|
| **Kisi-kisi Try Out** | Sekali, sebelum hasil TO diunggah | Super Admin yayasan untuk TO bersama; Anda untuk TO khusus sekolah Anda |
| **Hasil Try Out** | Setelah setiap TO | Admin sekolah |
| **Latihan Pekanan** | Setiap pekan | Admin sekolah |

Semua dilakukan di menu **Input Pekanan**.

### Status pekan ini
Bagian atas halaman **Input Pekanan** menampilkan kartu sekolah Anda untuk pekan berjalan (Senin–Minggu):

| Status | Arti |
|---|---|
| **Lengkap** | Latihan pekanan semua siswa kelas 6 (SD) / kelas 9 (SMP) sudah masuk, dan hasil TO yang dilaksanakan pekan ini atau pekan lalu sudah diunggah lengkap per butir soal. |
| **Sebagian** | Sebagian sudah masuk. Kartu menunjukkan yang kurang, misalnya "58 dari 60 siswa punya catatan latihan" atau "nilai total saja". |
| **Belum** | Belum ada data pekan ini. |

Prestasi hanya ditampilkan sebagai informasi (pekan tanpa lomba itu wajar) dan tidak memengaruhi status. Manajemen yayasan melihat kartu kelima sekolah, jadi usahakan status **Lengkap** sebelum akhir pekan. Gunakan **← Pekan sebelumnya** untuk melihat pekan lalu.

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

## Prestasi

Ada tiga cara memasukkan prestasi:

| Cara | Cocok untuk |
|---|---|
| **Unggah rekap** (Input Pekanan → Prestasi) | Banyak prestasi sekaligus, dalam format apa pun |
| **Tempel teks** (di halaman yang sama) | Rekap dari WhatsApp, atau tabel yang disalin dari Excel |
| **Tambah prestasi** (Prestasi → Tambah prestasi) | Satu prestasi, atau mengoreksi satu data |

### Unggah rekap
- Pakai **template standar** (tautan unduh tersedia di halaman unggah), atau langsung unggah **rekap sekolah Anda sendiri**. Portal mengenali kolom seperti "Nama Perlombaan/Event", "Tingkat, Kota Perlombaan", dan "Hasil Perlombaan", lalu menyesuaikan isinya ke daftar baku.
- **Tidak perlu khawatir data ganda.** Kalau Anda mengunggah ulang rekap yang sama (misalnya rekap kumulatif sejak Juli), prestasi yang sudah tersimpan otomatis dilewati. Hanya baris baru yang disimpan.
- Portal **tidak memaksakan** isian yang tidak cocok dengan daftar baku. Contoh:
  - "Medali Partisipasi" atau "Piagam Peserta Aktif": Peringkat dikosongkan, dan tulisan aslinya disimpan di Catatan.
  - Tingkat "Kecamatan" atau "Bandung Raya": Tingkat dikosongkan, dan tulisan aslinya disimpan di Catatan.
  - "Juara 1 Kategori Champion" dibaca sebagai *Juara 1*, dan tulisan lengkapnya disimpan di Catatan.

  Baris seperti ini ditandai **Perlu dicek**. Klik **Ubah** kalau ingin memilih nilai yang tepat.
- **Tanggal tidak lengkap** juga tetap dibaca. "14-16 Agustus 2026" dibaca 14 Agustus. "Agustus" saja dibaca 1 Agustus tahun ajaran berjalan. Tanggal aslinya dicatat sebagai "tanggal perkiraan".
- **Kategori** ditebak dari bidang lomba (renang → Olahraga, tari → Seni Budaya, olimpiade → Akademik, tahfidz → Non-Akademik). Kalau tidak bisa ditebak, pilih sendiri lewat **Ubah**.
- **Nama siswa** dicocokkan dengan data siswa. Nama yang tidak ditemukan (misalnya nama panggilan) **tetap disimpan apa adanya** dan tetap dihitung. Sebaiknya tulis nama lengkap supaya prestasi muncul di profil siswa.

### PDF, foto, dan teks bebas (bantuan AI)
Kalau Super Admin sudah mengaktifkan fitur AI di Pengaturan, Anda juga bisa mengunggah **PDF**, **foto** sertifikat atau poster, atau **menempel teks bebas** (misalnya pengumuman di grup WhatsApp). Portal akan membacanya dengan bantuan layanan AI.
- Hanya isi yang Anda unggah yang dikirim ke layanan AI. Daftar siswa tidak dikirim.
- Hasilnya **tidak pernah langsung tersimpan**. Semua baris tampil di pratinjau, dan kolom yang kurang diyakini AI ditandai "AI kurang yakin pada: …". Cocokkan dengan dokumen aslinya sebelum menekan Simpan.
- Kalau fitur AI nonaktif, teks yang ditempel harus berbentuk tabel (disalin dari Excel).

---

## Data siswa dan kelas

Menu **Master Data → Siswa** dan **Master Data → Kelas**. Admin sekolah mengelola siswa dan kelas sekolahnya sendiri.

### Impor data siswa (awal tahun ajaran atau siswa baru)
1. Buka **Master Data → Siswa**, klik **Impor data siswa dari Excel**.
2. Unduh template (sudah berisi siswa sekolah Anda), lalu tambahkan atau ubah barisnya. Kolom wajib: **NIS** dan **Nama Lengkap**. Kolom **Kelas** ditulis seperti `6A`, `VI-B`, `Kelas 9 C`, atau dengan nama rombel seperti `9 Ibnu Majid`.
   - Bila nama kelas di sekolah Anda **tidak memuat angka** (mis. hanya `Ibnu Majid`), pilih salah satu: tulis `9 Ibnu Majid`; **atau** tambahkan kolom **Tingkat** berisi `9`; **atau** buat dulu kelasnya di **Master Data → Kelas** (pilih Tingkat 9, nama `Ibnu Majid`), lalu di file cukup tulis `Ibnu Majid`.
   - Kelas disimpan dengan nama baku "tingkat + nama", mis. **9 Ibnu Majid**. Huruf besar/kecil dan spasi tidak berpengaruh: `IX - IBNU MAJID` dianggap kelas yang sama.
3. Unggah, periksa pratinjau, lalu **Simpan**. Pratinjau memberi tahu berapa siswa yang **baru** dan berapa yang **diperbarui** (misalnya pindah kelas).

Hal penting:
- Siswa dicocokkan berdasarkan **NIS**. NIS yang sudah ada = data diperbarui; NIS baru = siswa baru.
- Kelas yang belum ada di tahun ajaran aktif **dibuat otomatis**.
- Siswa yang **tidak ada** di file **tidak** diubah dan tidak dinonaktifkan. Untuk siswa pindah/lulus, gunakan tombol **Nonaktifkan** (di bawah).

### Mengubah satu siswa
Di daftar siswa, klik **Ubah** pada baris siswa. Anda bisa mengubah nama, NISN, jenis kelamin, dan kelas pada tahun ajaran aktif. NIS tidak bisa diubah dari sini karena dipakai untuk mencocokkan data unggahan; hubungi Super Admin bila NIS salah.

**Nonaktifkan** siswa yang pindah atau lulus. Nilai dan prestasinya tetap tersimpan, tetapi siswa tidak lagi dihitung di dashboard. Siswa bisa diaktifkan kembali kapan saja.

### Menambah kelas
Di **Master Data → Kelas**, isi nama kelas (mis. `6C`) lalu klik **Tambah kelas**. Kelas dibuat untuk tahun ajaran aktif.

---

## Khusus Super Admin (yayasan)

### Mengundang pengguna
Menu **Pengguna** → isi nama, email, dan peran → **Kirim undangan**. Pengguna menerima email berisi tautan untuk membuat kata sandi (berlaku 24 jam).

| Peran | Bisa apa |
|---|---|
| **Manajemen** | Melihat semua dashboard kelima sekolah, mengunduh laporan. Tidak bisa mengubah data. |
| **Admin Sekolah** | Mengunggah dan mengubah data **sekolahnya sendiri** saja. Wajib dipilihkan sekolahnya. |
| **Super Admin** | Semua akses, termasuk Pengaturan, Pengguna, dan Audit Log. |

Klik **Kelola** pada baris pengguna untuk mengubah peran/sekolah, **mengirim ulang undangan** (bila belum diterima atau kedaluwarsa), mengirim **tautan atur ulang kata sandi**, atau **menonaktifkan** akun. Akun nonaktif tidak bisa masuk; riwayat unggahannya tetap tersimpan. Anda tidak bisa menonaktifkan atau menurunkan peran akun Anda sendiri.

> Email undangan dikirim lewat layanan email Supabase yang dibatasi beberapa email per jam. Bila muncul pesan "batas pengiriman email tercapai", tunggu sekitar satu jam atau minta tim teknis memasang SMTP sendiri.

### Tahun ajaran baru
1. **Master Data → Tahun Ajaran** → isi mis. `2027/2028` → **Tambah**.
2. Saat tahun ajaran dimulai, klik **Jadikan aktif**.
3. Minta setiap admin sekolah **mengimpor data siswa** dengan kelas barunya. Kelas otomatis dibuat; data tahun lalu tetap tersimpan.

### Kompetensi
**Master Data → Kompetensi**: ubah nama sub-kompetensi atau tambah sub-kompetensi baru di sebuah elemen. Kodenya dibuat otomatis. Sub-kompetensi baru langsung muncul di dropdown template kisi-kisi TO.

### Pengaturan
Ambang status penguasaan, bobot TO vs latihan, target nilai per mapel (dan per sekolah bila perlu), aturan siswa berisiko, bobot **Poin Prestasi**, kategori yang dihitung **Akademik**, dan saklar **Ekstraksi AI**. Semua perubahan langsung berlaku dan tercatat di Audit Log.

### Laporan Manajemen
Menu **Laporan Manajemen** → pilih tahun ajaran dan periode → **Unduh PDF**. Isinya: ringkasan TKA per mapel, nilai TO terakhir per sekolah, lima kompetensi terlemah, rekap prestasi, dan status kelengkapan input pekan berjalan. Dokumen ini berisi nama siswa: bagikan hanya kepada pihak berwenang.

### Audit Log
Menu **Audit Log** mencatat setiap penambahan, perubahan, penghapusan, dan impor: siapa, kapan, dan apa yang berubah. Saring berdasarkan jenis data, aksi, pengguna, sekolah, atau tanggal, lalu klik **Lihat sebelum/sesudah** untuk rinciannya. Isi file unggahan tidak ditampilkan.

---

## Pertanyaan yang sering muncul

**"NIS … tidak ditemukan di data siswa sekolah ini."**
Siswa tersebut belum ada di data master, atau NIS-nya salah ketik. Periksa saran nama yang muncul di keterangan. Kalau siswa memang baru, tambahkan dulu lewat **Master Data → Siswa → Impor data siswa** (lihat [Data siswa dan kelas](#data-siswa-dan-kelas)), lalu unggah ulang.

**"Ada 2 siswa bernama …"**
Isi kolom NIS supaya portal tahu siswa yang dimaksud.

**Saya salah menyimpan data.**
Unggah ulang file yang benar. Untuk hasil TO dan latihan pekanan, data baru menggantikan data lama. Kalau perlu membatalkan sebuah unggahan sepenuhnya, hubungi Super Admin yayasan.

**File saya tidak terbaca sama sekali.**
Pastikan formatnya .xlsx, .xls, atau .csv dan tidak dilindungi kata sandi. Kalau masih gagal, salin datanya ke template resmi.
