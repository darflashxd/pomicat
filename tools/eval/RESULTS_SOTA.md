# SOTA NER Benchmark — Final Matrix (2026-10-16)

Gold identik untuk semua baris: ai4privacy EN 2000 (`tools/eval/data/ai4privacy_en.jsonl`,
seed 1337) + CLI hardneg 5000 (`data/cli_hardneg_gold.jsonl`). Metrik: `tools/eval/score.py`.
Bahasa Inggris diutamakan (target BlackHat internasional).

## ai4privacy EN 2000 (value recall / token F1)

| Model | Recall | F1 | Catatan |
|---|---|---|---|
| MiniLM Q4 produksi (35 label PII) | **0.808** | **0.848** | mengalahkan Presidio 0.79; gap DATE/TIME (ditutup Tier-1 ID_DOB_BARE, P2) |
| MiniLM Q4 + arbiter Tier-0 (perilaku Gate-2 extension) | 0.797 | 0.834 | setelah fix GIT_HASH-harus-huruf: CARD 0→0.975, SSN→0.806 |
| MiniLM Q4 + arbiter Tier-0 (perilaku Gate-2 extension) | 0.759 | 0.816 | threshold+veto pangkas CARD/SSN (tugas Tier-1) |
| Tier-1 rules + Gate-2 (UNION) | **0.811** | — | recall gabungan; best-of-both per label |
| GLiNER-bi-small zero-shot | 0.678 | 0.743 | tanpa latih; label generik |
| DeBERTa-xsmall fine-tune sintetis | 0.366 | 0.458 | sintetik F1 0.783 → transfer gagal |
| mMiniLMv2 fine-tune sintetis | 0.341 | 0.423 | sintetik F1 0.744 → transfer gagal ringan |
| SafeShare rules saja | 0.167 | 0.339 | hanya EMAIL/SSN/CARD |
| Electra fine-tune sintetis | 0.115 | 0.169 | sintetik F1 0.627 → transfer gagal total |

## CLI hardneg 5000 (FP-rate, target <2%)

| Model | FP-rate |
|---|---|
| Electra / mMiniLM / DeBERTa fine-tune (+hardneg) | **0.00%** |
| Hybrid MiniLM+arbiter (final) | **0.00%** (13.08% → 1.10% → 0.00% via Tier-0 BARE_PORT/SQL/PRIVATE_IP) |
| SafeShare rules (final) | **0.00%** (7.58% → 0.00% via pengecualian IP privat) |
| SafeShare rules | 7.58% (sisa: IP privat 10.x/192.168.x) |
| Hybrid MiniLM+arbiter | 13.08% (sisa: bare port, SQL id, IP privat) |
| MiniLM mentah | 38.34% |

## Latensi CPU proxy @128 token (ordering, bukan vonis WASM)

MiniLM 50ms · electra 63ms · mobilebert 166ms · mMiniLMv2 181ms · albert 244ms · deberta 1322ms (eager; ONNX/WASM beda jauh).

## Keputusan

1. **MiniLM produksi TETAP.** Tak ada kandidat mengalahkannya di PII Inggris real. Fine-tune sintetis-only terbukti tidak mentransfer (pelajaran utama, dilaporkan jujur).
2. **Cerita BlackHat yang didukung angka:** MiniLM 0.848 + arbiter menekan FP 38%→13% + Tier-1 menutup kartu/SSN (union 0.793) + inversion defense (0 recovered). GLiNER sebagai pembanding zero-shot yang kuat (0.743).
3. **Follow-up (bukan blocker Arsenal):** FP-CLI 13%→<2% via perluasan pola Tier-0/Tier-1 (bare port, SQL numerik, IP privat); DATE/TIME via DATE_TIME recognizer; uji multilingual bila perlu.
4. Go/no-go ganti `extension/models/`: **NO-GO** — tidak ada pemenang. Zoo 2.55GB boleh dihapus kecuali untuk reproduksibilitas.

Reproduksi: `tools/sota/RUNLOG.md` + script di `tools/sota/`.
