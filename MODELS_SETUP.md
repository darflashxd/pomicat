# SafeShare-AI: Panduan Distribusi Model ONNX & Ekstensi Browser

Dokumen ini menjelaskan perbedaan antara **paket ekstensi peramban siap pakai (End-User)** dan **bobot model riset Python (Developer/Researcher)** agar tidak terjadi kebingungan saat berbagi dengan pengguna lain.

---

## 1. Untuk Pengguna Ekstensi (End-Users / Teman / Evaluator)

Jika kamu hanya ingin menggunakan ekstensi SafeShare-AI di browser (Chrome / Firefox / Brave):
* **TIDAK PERLU mengunduh model ONNX 129 MB sama sekali.**
* Paket ekstensi peramban (`SafeShare-AI-Firefox.xpi` ~30 KB dan `SafeShare-AI-Chrome.zip` ~70 KB) bersifat **100% mandiri (*Self-Contained*)**.
* Seluruh aturan redaksi PII, aljabar proyeksi, pemetaan medis, shell prompt, dan enkripsi ZK AES-256-GCM telah tertanam langsung di engine JavaScript native (`heuristics.js`, `contextual.js`, `pseudonymizer.js`, `crypto.js`).
* Cukup pasang file `.xpi` (Firefox) atau folder zip (Chrome) $\to$ langsung berfungsi instan tanpa dependensi server atau model eksternal.

---

## 2. Untuk Peneliti & Pengembang Python (Developer R&D)

Berkas model ONNX (`model.onnx` ~515 MB dan `model_quantized.onnx` ~129 MB) melebihi batas upload maksimal GitHub (100 MB per file). Bobot model ini **hanya diperlukan oleh developer** yang ingin menjalankan skrip evaluasi Python / PyTorch (`evaluate_model.py`, `export_onnx.py`, atau `train_token_classifier.py`).

### Alur Setup Developer yang Baru Git Clone:
1. Unduh `safeshare_quantized_onnx.zip` dari tautan Google Drive tim yang tertera di `HANDOFF.md`:
   `https://drive.google.com/drive/folders/1gloPMGJ770SF6IXrDofkNn9TMOfIvbKi?usp=sharing`
2. Ekstrak seluruh isinya ke direktori:
   ```text
   extension/models/onnx/quantized/
   ```
3. Struktur berkas yang diharapkan untuk evaluasi Python:
   ```text
   extension/models/onnx/quantized/
   ├── model_quantized.onnx   (~129 MB)
   ├── config.json
   ├── ort_config.json
   ├── tokenizer.json
   └── vocab.txt
   ```
4. Jalankan evaluasi benchmark:
   ```bash
   python training/evaluate_model.py
   ```
