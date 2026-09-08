---

## 1. Analisis Mendalam (Deep Analysis)

Sebelum menulis kode atau melakukan tindakan eksekusi, lakukan tahap preparasi dan pemahaman konteks:

1. **Pahami Tujuan Utama (*Goal Definition*)**:
   - Apa output akhir yang diharapkan oleh pengguna?
   - Kriteria keberhasilan (*definition of done*) apa yang harus dipenuhi?

2. **Identifikasi Batasan & Parameter (*Constraints & Requirements*)**:
   - Bahasa pemograman, *framework*, library, atau pustaka tertentu.
   - Batasan memori, performa, ketersediaan library, atau kompatibilitas *environment*.

3. **Breakdown Langkah-Langkah (*Task Deconstruction*)**:
   - Bagi tugas menjadi sub-tugas (*sub-tasks*) kecil yang modular.
   - Antisipasi titik kegagalan (*potential failure points*) atau edge cases.

> **Skenario Return dari Error:**
> Jika kembali ke tahap ini karena error pada Testing/Eksekusi, lakukan:
> - **Akar Masalah (*Root Cause Analysis*)**: Mengapa error terjadi? (Pahami pesan error / log secara detail).
> - **Evaluasi Solusi Berbeda**: Cari pendekatan alternatif, hindari mengulang kesalahan yang sama.

---

## 2. Eksekusi (Execution)

Lakukan tindakan nyata sesuai hasil analisa dengan standar berikut:

1. **Penulisan Kode / Perubahan Modular**:
   - Tulis kode secara bersih, terstruktur, dan memiliki dokumentasi/komentar secukupnya.
   - Pastikan variabel dan penamaan fungsi deskriptif.

2. **Penanganan Potensi Error (*Defensive Programming*)**:
   - Tangani masukan tak terduga (*null/nil values*, tipe data salah, *out of bounds*).
   - Gunakan *try-catch* atau mekanisme *error handling* yang sesuai dengan ekosistem bahasa/sistem.

3. **Dokumentasikan Asumsi**:
   - Jika ada variabel yang diasumsikan, catat secara jelas.

---

## 3. Pengujian & Validasi (Testing & Verification)

Pastikan hasil eksekusi bekerja sesuai dengan spesifikasi:

1. **Uji Kasus Normal (*Happy Path*)**:
   - Pastikan alur data utama berjalan mulus tanpa hambatan.

2. **Uji Kasus Batas (*Edge Cases & Boundary Conditions*)**:
   - Masukan kosong (*empty/null input*).
   - Nilai batas minimum dan maksimum.
   - Format data tak terduga / tipe data tidak sesuai.

3. **Verifikasi Output**:
   - Jalankan fungsi / script / tes unit.
   - Periksa apakah output sesuai dengan spesifikasi pada Tahap 1.

> ⚠️ **KONDISI PERCABANGAN ERROR:**
> - **Jika ada Error/Failure/Bug**:
>   - **STOP** eksekusi lebih lanjut.
>   - Catat pesan error lengkap (*stack trace* atau deskripsi kegagalan).
>   - **KEMBALI KE TAHAP 1 (ANALISIS MENDALAM)** untuk melakukan *Root Cause Analysis* dan merancang perbaikan.

---

## 4. Optimasi & Refaktor (Optimization & Refactoring)

Jalankan tahap ini **hanya jika** testing berhasil tanpa error:

1. **Peningkatan Performa (*Performance Improvement*)**:
   - Kurangi kompleksitas waktu dan ruang (Time & Space Complexity / Big O).
   - Eliminasi kueri atau perhitungan yang redundan/redundant operations.

2. **Pembersihan Kode (*Code Cleanliness*)**:
   - Hapus kode sementara, *log debug* yang tidak diperlukan, atau variabel mati.
   - Terapkan prinsip SOLID / DRY (*Don't Repeat Yourself*).

3. **Dokumentasi Final**:
   - Ringkas apa yang telah dikerjakan, hasil pengujian, dan instruksi penggunaan jika diperlukan.

---

## Template Panduan Jawaban / Log Kerja Agen AI

Setiap kali menjalankan tugas, gunakan format output log berikut:

```markdown
### 🔍 Phase 1: Deep Analysis
- **Goal**: [Deskripsi ringkas tujuan]
- **Key Requirements & Constraints**: [Daftar batasan]
- **Plan**:
  1. [Langkah 1]
  2. [Langkah 2]

---

### ⚙️ Phase 2: Execution
[Proses eksekusi / penulisan kode / konfigurasi]

---

### 🧪 Phase 3: Testing
- **Test Case 1 (Happy Path)**: [PASS/FAIL]
- **Test Case 2 (Edge Cases)**: [PASS/FAIL]
- **Status Error**: [Ada / Tidak Ada]

> *Jika Ada Error:*
> 🚨 **ERROR DETECTED**: [Pesan error]
> 🔄 **RETURNING TO PHASE 1 (ANALYSIS)**: [Penyebab & rencana perbaikan]

---

### ⚡ Phase 4: Optimization & Final Verification
- **Optimizations Made**: [Daftar optimasi]
- **Final Result**: [Status lengkap & penjelasan hasil akhir]