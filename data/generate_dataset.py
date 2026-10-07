"""
SafeShare-AI — Comprehensive Contextual Privacy Dataset Generator V2
Generates 60,000+ balanced contrastive pairs (Indonesian & English) across:
1. Financial: Personal 1st/2nd person, rounded projections (33jt), increments, remainders vs Market Benchmarks.
2. User & Terminal: Powerline (@darflashxd), Kali (┌──(user㉿host)), macOS, PowerShell, Git, SSH vs Safe Commands.
3. Health (PHI): 1st/2nd person, brand-to-generic mappings (Lexapro <-> escitalopram) vs Pharmacology.
4. Corporate Assets: Internal databases, secret project codenames vs Open-Source / Localhost.
5. HR & Disciplinary: Personal SP-1/SP-2/SP-3 sanctions vs Statutory labor law.
6. General Computing & CTF: Assembly (&setcontext), GDB, memory addresses, programming syntax (Safe O).
"""

import json
import random
import os
import re
from typing import List, Dict, Tuple

random.seed(42)

LABELS = [
    "O",
    "B-SENSITIVE_FINANCIAL", "I-SENSITIVE_FINANCIAL",
    "B-SENSITIVE_HEALTH",    "I-SENSITIVE_HEALTH",
    "B-SENSITIVE_CORP",      "I-SENSITIVE_CORP",
    "B-SENSITIVE_LEGAL_HR",  "I-SENSITIVE_LEGAL_HR",
    "B-SENSITIVE_USER",      "I-SENSITIVE_USER"
]

# Currencies & Salary values
CURRENCIES_ID = ["Rp ", "Rp", "IDR "]
CURRENCIES_EN = ["$", "USD "]
SALARY_NUMS_ID = [
    "5.500.000", "7.200.000", "8.000.000", "12.500.000", "14.200.000", "15.000.000",
    "18.500.000", "22.000.000", "25.000.000", "28.500.000", "32.775.000", "33.000.000",
    "34.200.000", "35.000.000", "45.000.000", "60.000.000",
    "10 juta", "14,2 jt", "15 juta", "20jt", "28,5 jt", "28.5 jt", "32,775 jt", "33 juta", "33 jt", "34,2 juta", "35 juta"
]
SALARY_NUMS_EN = [
    "45,000", "65,000", "85,000", "95,000", "110,000", "130,000",
    "145,000", "150,000", "160,000", "172,500", "175,000", "180,000", "185,000", "210,000",
    "75k", "90k", "120k", "150k", "175k"
]

DEBT_NUMS_ID = [
    "14.200.000", "15.000.000", "18.575.000", "20.000.000", "24.500.000", "38.000.000", "50.000.000", "14,2 jt", "45jt"
]
DEBT_NUMS_EN = [
    "8,500", "14,200", "22,000", "35,000", "65,000", "12k", "40k"
]

JOB_ROLES_ID = [
    "Software Engineer", "Frontend Developer", "Data Scientist", "Product Manager",
    "DevOps Engineer", "Akuntan", "Staff HRD", "Digital Marketer", "Security Analyst", "Backend Engineer"
]
JOB_ROLES_EN = [
    "Software Engineer", "Data Scientist", "Product Manager", "Cloud Architect",
    "Security Analyst", "Marketing Director", "Backend Engineer", "ML Researcher"
]

CITIES_ID = ["Jakarta", "Surabaya", "Bandung", "Karawang", "Bekasi", "Medan", "Bali", "Tangerang"]
CITIES_EN = ["San Francisco", "New York", "Austin", "Seattle", "London", "Berlin", "Singapore"]

# Usernames and handles for terminal OPSEC
USERNAMES = [
    "darflashxd", "dracraaah", "budianto", "budi_santoso", "alice_sec", "bob_dev",
    "cyber_hacker99", "shadow_ops", "kurniawan_aditya", "dimas_pratama", "sarah_miller",
    "alex_hunter", "charlie_k8s", "john_doe", "root_admin", "secops_lead", "midn8"
]
HOSTNAMES = [
    "midn8", "kali", "arch-workstation", "ubuntu-desktop", "corp-macbook", "dev-box-01",
    "fedora-thinkpad", "MacBook-Pro", "prod-master", "sandbox-pc"
]
DIRECTORIES = [
    "CTFdScraper", "CTF/Binary Exploitation", "projects/core-backend", "work/fintech",
    "Documents/secrets", "Downloads/dumps", "src/auth", "workspace/repo"
]

DISEASES_ID = [
    "kanker usus stadium 2", "hepatitis B akut", "diabetes melitus tipe 2",
    "gagal ginjal stadium akhir", "leukimia limfositik", "HIV positif",
    "skizofrenia paranoid", "bipolar episode depresi", "TBC paru aktif",
    "kanker payudara stadium 3", "gangguan kecemasan menyeluruh (GAD)", "depresi klinis berat"
]
DISEASES_EN = [
    "stage 2 colon cancer", "acute hepatitis B", "type 2 diabetes",
    "end-stage renal disease", "chronic lymphocytic leukemia", "HIV positive",
    "paranoid schizophrenia", "bipolar 1 disorder", "active pulmonary tuberculosis",
    "stage 3 breast cancer", "generalized anxiety disorder", "severe major depression"
]

MEDICATIONS_ID = [
    "Lexapro 20mg", "escitalopram 10mg", "escitalopram 20mg", "escitalopram",
    "Sertraline 50mg", "Alprazolam 1mg", "Metformin 500mg", "Fluoxetine 20mg",
    "Insulin Glargine 100 IU", "Chemotherapy Cisplatin", "Risperidone 2mg", "Diazepam 5mg",
    "Methylphenidate 10mg", "Zoloft 50mg", "Xanax 1mg"
]
MEDICATIONS_EN = [
    "Lexapro 20mg", "escitalopram 10mg", "escitalopram 20mg", "escitalopram",
    "Sertraline 50mg", "Alprazolam 1mg", "Metformin 500mg", "Fluoxetine 20mg",
    "Adderall 20mg XR", "Cisplatin IV", "Risperidone 2mg", "Zoloft 100mg",
    "Methylphenidate 10mg", "Diazepam 5mg", "Xanax 1mg"
]

PROJECTS_CORP_ID = [
    "Project Garuda-Fintech", "Project Valkyrie Core", "Inisiatif Merger Titan",
    "Operasi BlackHawk", "Project Aurora Migration", "Protokol Aegis-Internal"
]
PROJECTS_CORP_EN = [
    "Project Nightfall", "Project Apollo Core", "Project Titan Acquisition",
    "Project BlueSky Migration", "Project Cerberus Zero", "Project Aegis Stealth"
]

HOSTNAMES_CORP = [
    "prod-db-master.corp.internal:5432", "auth-service.stg.private.io:8080",
    "k8s-cluster.intranet.local:6443", "vault-core.corp.lan:8200",
    "redis-cache-cluster.internal.net:6379"
]

HR_ACTIONS_ID = [
    "Surat Peringatan Ketiga (SP-3)", "Surat Peringatan Pertama (SP-1)",
    "pemutusan hubungan kerja (PHK) sepihak", "Program Peningkatan Kinerja (PIP) 30 hari",
    "skorsing investigasi fraud internal", "surat teguran keras direksi"
]
HR_ACTIONS_EN = [
    "final written warning", "first performance warning",
    "unilateral wrongful termination", "30-day Performance Improvement Plan (PIP)",
    "suspension pending internal fraud investigation", "formal disciplinary reprimand"
]


def tokenize_and_label(text: str, entity_substring: str = None, label_prefix: str = None) -> Tuple[List[str], List[str]]:
    """Tokenizes by whitespace and assigns exact character-span aligned BIO labels."""
    tokens = []
    spans = []
    for m in re.finditer(r'\S+', text):
        tokens.append(m.group())
        spans.append((m.start(), m.end()))
        
    labels = ["O"] * len(tokens)
    
    if entity_substring and label_prefix:
        start = text.find(entity_substring)
        if start != -1:
            end = start + len(entity_substring)
            first = True
            for idx, (s, e) in enumerate(spans):
                if s < end and e > start:
                    if first:
                        labels[idx] = f"B-{label_prefix}"
                        first = False
                    else:
                        labels[idx] = f"I-{label_prefix}"
                        
    return tokens, labels


def generate_financial_dataset(n_samples: int = 15000) -> List[Dict]:
    data = []
    per_category = n_samples // 3

    # 1. Personal & Assistant Dialogues (1st person, 2nd person, Projections, Remainders)
    for _ in range(per_category):
        curr = random.choice(CURRENCIES_ID)
        sal = random.choice(SALARY_NUMS_ID)
        ent = f"{curr}{sal}"
        role = random.choice(JOB_ROLES_ID)
        city = random.choice(CITIES_ID)
        debt = random.choice(DEBT_NUMS_ID)
        
        # 1st person, 2nd person, Assistant advice, and Algebraic Midpoints (33 juta!)
        templates = [
            f"Gaji pokok saya saat ini adalah {ent} per bulan di kantor.",
            f"Untuk gaji Anda yang saat ini {ent}, Anda bisa meminta kenaikan 15-20% menjadi sekitar {ent} dengan menekankan kontribusi Anda.",
            f"Berdasarkan penghasilan kamu sebesar {ent}, target negosiasi yang wajar adalah {ent}.",
            f"Kenaikan bersih yang Anda terima setiap bulan diperkirakan sebesar {ent}.",
            f"Setelah dipotong cicilan KPR dan hutang pinjol sebesar {debt}, sisa uang Anda per bulan adalah {ent}.",
            f"Gaji pokok Anda saat ini: {ent}/bulan dengan cicilan {debt}/bulan.",
            f"Jika mengajukan kenaikan 15%, proyeksi gaji baru Anda menjadi {ent}.",
            f"Dengan kompensasi Anda sekarang sebesar {ent}, Anda berhak mengajukan penyesuaian gaji.",
            f"Take home pay saya tercatat {ent} dan saya butuh evaluasi pengeluaran bulanan.",
            f"Kompensasi Anda yang saat ini {ent} berada dalam rentang evaluasi kuartal ini."
        ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, ent, "SENSITIVE_FINANCIAL")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SENSITIVE"})

    # 2. English Financial Dialogue & Projections
    for _ in range(per_category):
        curr = random.choice(CURRENCIES_EN)
        sal = random.choice(SALARY_NUMS_EN)
        ent = f"{curr}{sal}"
        role = random.choice(JOB_ROLES_EN)
        city = random.choice(CITIES_EN)
        
        templates = [
            f"My current base compensation as a {role} in {city} is {ent} annually.",
            f"For your current compensation of {ent}, you can request a 15-20% raise up to {ent}.",
            f"Based on your current salary of {ent}, your projected take-home pay will be {ent}.",
            f"Your net monthly residual after mortgage payment is {ent}.",
            f"I make {ent} as a {role} and my personal debt is {ent}."
        ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, ent, "SENSITIVE_FINANCIAL")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SENSITIVE"})

    # 3. Contrastive Safe (Market Benchmarks, Indeed, Glassdoor, Math & Tax Problems)
    for _ in range(per_category):
        curr = random.choice(CURRENCIES_ID)
        sal = random.choice(SALARY_NUMS_ID)
        ent = f"{curr}{sal}"
        role = random.choice(JOB_ROLES_ID)
        city = random.choice(CITIES_ID)
        
        stat_templates = [
            f"Berdasarkan data pasar tahun 2026, rata-rata gaji {role} di {city} adalah {ent} per bulan.",
            f"Indeed mencatat rata-rata base salary {role} di {city} sekitar {ent} per bulan.",
            f"Glassdoor mencatat median total pay sekitar {ent} per bulan berdasarkan laporan publik.",
            f"Levels.fyi mencatat median total compensation tahunan {role} sekitar {ent}.",
            f"Standar upah minimum regional (UMR) yang ditetapkan pemerintah adalah {ent}.",
            f"Misalkan seorang pengusaha meminjam modal awal {ent} dengan bunga 5% per tahun.",
            f"Contoh soal akuntansi: hitung PPh 21 dari penghasilan kena pajak sebesar {ent}."
        ]
        stat_text = random.choice(stat_templates)
        tokens, labels = tokenize_and_label(stat_text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SAFE_STATISTICAL"})

    return data


def generate_user_terminal_dataset(n_samples: int = 15000) -> List[Dict]:
    data = []
    per_type = n_samples // 2

    # 1. Sensitive Usernames, Shell Prompts, Git Traces, and SSH Keys
    for _ in range(per_type):
        user = random.choice(USERNAMES)
        host = random.choice(HOSTNAMES)
        directory = random.choice(DIRECTORIES)
        
        prompt_templates = [
            f"Mon 28 Sep - 18:24  ~  @{user}  node demo.js",
            f"┌──({user}㉿{host})-[~/{directory}]\\n└─$ ./libc.so.6",
            f"{user}@{host}:~/{directory}$ gdb -q ./core",
            f"{user}@{host} ~ % brew install cmake",
            f"PS C:\\Users\\{user}\\Projects\\backend> git status",
            f"C:\\Users\\{user}\\Desktop> python run.py",
            f"Author: {user} <{user}@corp.internal>",
            f"Signed-off-by: {user} <{user}@company.com>",
            f"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5... {user}@{host}",
            f"Halo perkenalkan saya @{user} tim security engineer.",
            f"Nama saya {user}, silakan hubungi saya di internal chat.",
            f"uid=1000({user}) gid=1000({user}) groups=1000({user})"
        ]
        s_text = random.choice(prompt_templates)
        tokens, labels = tokenize_and_label(s_text, user, "SENSITIVE_USER")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "USER_SYS", "type": "SENSITIVE"})

    # 2. Contrastive Safe (Commands, Code, Linux Architecture, GDB, CTF Tools)
    safe_commands = [
        "gdb -q --batch -ex 'x/2i &setcontext' ./libc.so.6",
        "readelf -Ws ./libc.so.6 | grep system",
        "checksec --file=./binary_target",
        "docker run -d --name test-nginx -p 8080:80 nginx:alpine",
        "git clone https://github.com/torvalds/linux.git --depth=1",
        "npm install --save-dev typescript @types/node jest",
        "python3 -m venv venv && source venv/bin/activate",
        "cat /etc/os-release && uname -a",
        "Dalam binary exploitation, &setcontext merupakan alamat fungsi di libc.",
        "Istilah setcontext merujuk pada pemulihan context registers execution.",
        "Variabel pointer menyimpan alamat memori di stack atau heap pada bahasa C.",
        "Alamat IP lokal default gateway untuk konfigurasi jaringan adalah 192.168.1.1.",
        "Fungsi POSIX mprotect digunakan untuk mengubah permission memori (PROT_READ, PROT_WRITE)."
    ]
    for _ in range(per_type):
        text = random.choice(safe_commands)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "GENERAL_CODE", "type": "SAFE"})

    return data


def generate_health_dataset(n_samples: int = 12000) -> List[Dict]:
    data = []
    per_type = n_samples // 2

    # 1. Sensitive (1st & 2nd person, brands, generic mappings)
    for _ in range(per_type):
        med = random.choice(MEDICATIONS_ID)
        disease = random.choice(DISEASES_ID)
        
        templates = [
            f"Kemarin dokter psikiater mendiagnosis saya mengidap {disease} dan meresepkan {med}.",
            f"Untuk kondisi kecemasan Anda, jangan pernah mengubah dosis obat {med} sendiri.",
            f"Dokter Anda telah meresepkan {med}, pastikan minum secara teratur sesuai jadwal.",
            f"Saya didiagnosis menderita {disease} stadium lanjut.",
            f"Zat aktif dari obat resep Anda adalah {med}, konsultasikan efek sampingnya ke psikiater.",
            f"Hasil biopsi menunjukkan Anda positif mengidap {disease}."
        ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, med, "SENSITIVE_HEALTH")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HEALTH", "type": "SENSITIVE"})

    # 2. Contrastive Safe (Educational & Pharmacology)
    for _ in range(per_type):
        med = random.choice(MEDICATIONS_ID)
        disease = random.choice(DISEASES_ID)
        
        stat_templates = [
            f"Bagaimana mekanisme kerja farmakologi dari obat {med} pada reseptor serotonin?",
            f"Apa saja faktor risiko utama dan penanganan medis umum untuk penyakit {disease}?",
            f"Artikel kedokteran menjelaskan bahwa {med} bekerja sebagai selective serotonin reuptake inhibitor.",
            f"Studi klinis menunjukkan efikasi terapi kombinasi untuk pasien dengan diagnosis {disease}.",
            f"Perbedaan farmakokinetik antara formulasi generik dan paten dari {med}."
        ]
        text = random.choice(stat_templates)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HEALTH", "type": "SAFE_PHARMA"})

    return data


def generate_corporate_dataset(n_samples: int = 10000) -> List[Dict]:
    data = []
    per_type = n_samples // 2

    for _ in range(per_type):
        proj = random.choice(PROJECTS_CORP_ID)
        host = random.choice(HOSTNAMES_CORP)
        templates = [
            f"Nama sandi proyek integrasi rahasia perbankan kita adalah {proj}.",
            f"Server staging internal kita dapat dihubungi melalui endpoint {host}.",
            f"Basis data internal repositori {proj} menggunakan kredensial privat.",
            f"Database staging kami berjalan di {host} dengan database core."
        ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, proj, "SENSITIVE_CORP")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "CORP", "type": "SENSITIVE"})

    for _ in range(per_type):
        safe_texts = [
            "Proyek open source Apache Kafka menyediakan sistem message streaming performa tinggi.",
            "Contoh koneksi database lokal untuk testing: postgresql://localhost:5432/testdb.",
            "Docker compose mendefinisikan service database redis dan postgres lokal pada port default.",
            "Proyek Linux Foundation mendukung standarisasi protokol interoperabilitas cloud native."
        ]
        text = random.choice(safe_texts)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "CORP", "type": "SAFE"})

    return data


def generate_hr_legal_dataset(n_samples: int = 10000) -> List[Dict]:
    data = []
    per_type = n_samples // 2

    for _ in range(per_type):
        action = random.choice(HR_ACTIONS_ID)
        templates = [
            f"Saya baru saja dijatuhi sanksi {action} oleh divisi kepatuhan.",
            f"Manajemen telah menerbitkan {action} untuk Anda karena pelanggaran disiplin.",
            f"Karyawan yang bersangkutan resmi menerima {action} dari direksi.",
            f"Saya dipanggil HRD dan langsung disodori surat {action}."
        ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, action, "SENSITIVE_LEGAL_HR")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HR_LEGAL", "type": "SENSITIVE"})

    for _ in range(per_type):
        safe_texts = [
            "Berdasarkan regulasi ketenagakerjaan, apa syarat hukum sahnya penerbitan Surat Peringatan Ketiga (SP-3)?",
            "Pasal 151 Undang-Undang Ketenagakerjaan mengatur prosedur mediasi sebelum pemutusan hubungan kerja.",
            "Berapa batas waktu pemberian hak jawab bagi pekerja yang menerima evaluasi kinerja?",
            "Ketentuan peraturan perundang-undangan mewajibkan transparansi dalam klausul kontrak kerja."
        ]
        text = random.choice(safe_texts)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HR_LEGAL", "type": "SAFE"})

    return data


def main():
    print("[*] Generating SafeShare-AI High-Entropy 62,000+ Multi-Domain Dataset V2...")
    
    fin_data = generate_financial_dataset(15000)
    user_data = generate_user_terminal_dataset(15000)
    health_data = generate_health_dataset(12000)
    corp_data = generate_corporate_dataset(10000)
    hr_data = generate_hr_legal_dataset(10000)
    
    all_data = fin_data + user_data + health_data + corp_data + hr_data
    random.shuffle(all_data)
    
    total = len(all_data)
    print(f"[+] Total generated contrastive samples: {total:,}")
    
    # Split: 80% Train (49,600), 10% Val (6,200), 10% Test (6,200)
    n_train = int(0.80 * total)
    n_val = int(0.10 * total)
    
    train_data = all_data[:n_train]
    val_data = all_data[n_train:n_train + n_val]
    test_data = all_data[n_train + n_val:]
    
    out_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)
    
    print("[*] Writing datasets to disk...")
    with open(os.path.join(out_dir, "train.json"), "w", encoding="utf-8") as f:
        json.dump(train_data, f, ensure_ascii=False)
    with open(os.path.join(out_dir, "val.json"), "w", encoding="utf-8") as f:
        json.dump(val_data, f, ensure_ascii=False)
    with open(os.path.join(out_dir, "test.json"), "w", encoding="utf-8") as f:
        json.dump(test_data, f, ensure_ascii=False)
        
    print(f"[+] Successfully wrote {len(train_data):,} train, {len(val_data):,} val, {len(test_data):,} test samples!")


if __name__ == "__main__":
    main()
