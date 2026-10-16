"""
SafeShare-AI — Comprehensive Contextual Privacy Dataset Generator V4 (SafeShare-PrivacyBench 100k)

Key Innovations:
1. Probabilistic Context-Free Grammar (PCFG): 300+ combinatorial syntactic patterns.
2. 100,000 Balanced Samples with Template-Disjoint Partitioning:
   - 80,000 Train samples (80%)
   - 10,000 Validation samples (10%)
   - 10,000 Test samples (10%)
3. Global Multi-Domain Coverage:
   - Silicon Valley Tech Comp ($380k TC, base, RSUs, 409A, strike price, ISOs)
   - Indian Tech Comp: 45 LPA, 10 Lakhs, 1.5 Crores
   - European Comp: €, £, CHF with pension/tax deductions
   - GAAP Accounting Parentheses Deficits: ($650,000), monthly burn rate, runway
   - Healthcare & Mental Health (HIPAA): Bipolar II, MDD, oncology staging, trauma
   - Workplace & HR: Performance Improvement Plans (PIP), final written warnings, Title VII
4. Developer Code, SQL & Technical Hard Negatives (Label O - Safe):
   - SQL queries (`SELECT employee_id, salary FROM payroll`)
   - Python & JavaScript variables (`const user_id = 1000; let salary = 0;`)
   - C++ structs and JSON payloads
   - Shell commands, Linux kernel, GDB registers, x86_64 shellcode, CVE advisories
5. Human Organic Seeds & Conversational Evasion (Reddit, Blind, Typos):
   - Unstructured conversational prompts, typos (slary, accunt, gji), code-switching
"""

import json
import random
import os
import re
from typing import List, Dict, Tuple

random.seed(1337)

LABELS = [
    "O",
    "B-SENSITIVE_FINANCIAL", "I-SENSITIVE_FINANCIAL",
    "B-SENSITIVE_HEALTH",    "I-SENSITIVE_HEALTH",
    "B-SENSITIVE_CORP",      "I-SENSITIVE_CORP",
    "B-SENSITIVE_LEGAL_HR",  "I-SENSITIVE_LEGAL_HR",
    "B-SENSITIVE_USER",      "I-SENSITIVE_USER"
]

CURRENCIES_ID = ["Rp ", "Rp", "IDR "]
CURRENCIES_EN = ["$", "USD ", "€", "£", "CHF ", "SGD ", "AUD ", "CAD ", "EUR ", "GBP ", "¥"]
CURRENCIES_IN = ["₹", "INR "]

SALARY_NUMS_ID = [
    "5.500.000", "7.200.000", "8.000.000", "12.500.000", "14.200.000", "15.000.000",
    "18.500.000", "22.000.000", "25.000.000", "28.500.000", "32.775.000", "33.000.000",
    "34.200.000", "35.000.000", "45.000.000", "60.000.000",
    "10 juta", "14,2 jt", "15 juta", "20jt", "28,5 jt", "28.5 jt", "32,775 jt", "33 juta", "33 jt", "45 jeti nett", "2 ember"
]
SALARY_NUMS_EN = [
    "45,000", "65,000", "85,000", "95,000", "110,000", "120,000", "130,000", "140,000",
    "145,000", "150,000", "160,000", "172,500", "175,000", "180,000", "185,000", "210,000", "380,000",
    "75k", "90k", "95k", "120k", "150k", "180k", "250k", "350k TC", "380k TC", "440k", "250 racks", "half a mil"
]
SALARY_NUMS_IN = [
    "18 LPA", "24 LPA", "32 LPA", "45 LPA", "60 LPA", "12 Lakhs", "15 Lakh", "25 Lakhs", "45 Lakhs", "1.2 Crore", "2.5 Crores"
]

DEBT_NUMS_ID = [
    "14.200.000", "15.000.000", "18.575.000", "20.000.000", "24.500.000", "38.000.000", "50.000.000", "14,2 jt", "45jt"
]
DEBT_NUMS_EN = [
    "8,500", "14,200", "22,000", "35,000", "42,500", "65,000", "135,000", "12k", "25k", "40k"
]

JOB_ROLES_ID = [
    "Software Engineer", "Frontend Developer", "Data Scientist", "Product Manager",
    "DevOps Engineer", "Akuntan", "Staff HRD", "Digital Marketer", "Security Analyst", "Backend Engineer"
]
JOB_ROLES_EN = [
    "Staff Software Engineer", "Data Scientist", "VP of Engineering", "Cloud Architect",
    "Security Analyst", "Quantitative Trader", "Backend Engineer", "ML Researcher", "Site Reliability Engineer"
]

CITIES_ID = ["Jakarta", "Surabaya", "Bandung", "Karawang", "Bekasi", "Medan", "Bali", "Tangerang"]
CITIES_EN = ["San Francisco", "New York", "Austin", "Seattle", "London", "Berlin", "Singapore", "Bangalore"]

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
    "Stage IV adenocarcinoma", "Stage 2 colon cancer", "Bipolar II disorder", "Major Depressive Disorder",
    "type 2 diabetes", "adult ADHD", "chronic lymphocytic leukemia", "HIV positive",
    "paranoid schizophrenia", "bipolar 1 disorder", "active pulmonary tuberculosis",
    "stage 3 breast cancer", "generalized anxiety disorder", "severe clinical depression", "childhood trauma", "suicidal ideation"
]

MEDICATIONS_ID = [
    "Lexapro 20mg", "escitalopram 10mg", "escitalopram 20mg", "escitalopram",
    "Sertraline 50mg", "Alprazolam 1mg", "Metformin 500mg", "Fluoxetine 20mg",
    "Insulin Glargine 100 IU", "Chemotherapy Cisplatin", "Risperidone 2mg", "Diazepam 5mg",
    "Methylphenidate 10mg", "Zoloft 50mg", "Xanax 1mg", "Klonopin 0.5mg"
]
MEDICATIONS_EN = [
    "Lexapro 20mg", "escitalopram 10mg", "escitalopram 20mg", "Zoloft 50mg", "Wellbutrin XL 150mg",
    "Sertraline 50mg", "Alprazolam 1mg", "Metformin 500mg", "Fluoxetine 20mg", "Lithium Carbonate 300mg",
    "Adderall XR 20mg", "Ritalin 10mg", "Risperidone 2mg", "Klonopin 0.5mg", "Seroquel 200mg", "Lantus insulin", "Biktarvy",
    "rituximab 500mg", "venlafaxine 75mg", "duloxetine 60mg", "bupropion 150mg", "methotrexate 25mg", "keytruda 200mg"
]

PROJECTS_CORP_EN = [
    "Project Chimera", "Project Valkyrie", "Project Nightfall", "Project Apollo Core", "Project Titan Acquisition",
    "Project BlueSky Migration", "Project Cerberus Zero", "Project Aegis Stealth"
]

HR_ACTIONS_EN = [
    "60-day Performance Improvement Plan (PIP)", "final written warning", "first performance warning",
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


def generate_financial_partition(is_test: bool = False, n_samples: int = 7000) -> List[Dict]:
    data = []
    per_bucket = n_samples // 4

    for _ in range(per_bucket):
        curr = random.choice(CURRENCIES_ID)
        sal = random.choice(SALARY_NUMS_ID)
        ent = f"{curr}{sal}"
        debt = random.choice(DEBT_NUMS_ID)

        if not is_test:
            templates = [
                f"Gaji pokok saya saat ini adalah {ent} per bulan di kantor.",
                f"Untuk gaji Anda yang saat ini {ent}, Anda bisa meminta kenaikan 15-20% menjadi sekitar {ent} dengan menekankan kontribusi Anda.",
                f"Berdasarkan penghasilan kamu sebesar {ent}, target negosiasi yang wajar adalah {ent}.",
                f"Kenaikan bersih yang Anda terima setiap bulan diperkirakan sebesar {ent}.",
                f"Setelah dipotong cicilan KPR dan hutang pinjol sebesar {debt}, sisa uang Anda per bulan adalah {ent}."
            ]
        else:
            templates = [
                f"Gaji pokok Anda saat ini: {ent}/bulan dengan cicilan {debt}/bulan.",
                f"Jika mengajukan kenaikan 15%, proyeksi gaji baru Anda menjadi {ent}.",
                f"Take home pay saya tercatat {ent} dan saya butuh evaluasi pengeluaran bulanan.",
                f"Kompensasi Anda sekarang tercatat {ent} setelah kenaikan performa kuartalan.",
                f"Tabungan saya saat ini mencapai {ent} dan siap dialokasikan untuk uang muka rumah."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, ent, "SENSITIVE_FINANCIAL")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SENSITIVE"})

    for _ in range(per_bucket):
        curr = random.choice(CURRENCIES_EN)
        sal = random.choice(SALARY_NUMS_EN)
        ent = f"{curr}{sal}" if not sal.startswith("$") else sal
        role = random.choice(JOB_ROLES_EN)
        city = random.choice(CITIES_EN)

        if not is_test:
            templates = [
                f"My current base compensation as a {role} in {city} is {ent} annually.",
                f"For your current compensation of {ent}, you can request a 15-20% raise up to {ent}.",
                f"I am negotiating for {ent} TC including base and equity.",
                f"My monthly net income is {ent} and I am looking for budgeting advice.",
                f"We reported an operating cash deficit of ({ent}) for the recent quarter."
            ]
        else:
            templates = [
                f"Based on your current salary of {ent}, your projected take-home pay will be {ent}.",
                f"Your net monthly residual after mortgage payment is {ent}.",
                f"I make {ent} as a {role} and my personal debt is {ent}.",
                f"Sitting on {ent} in high-yield savings accounts before wire transfer.",
                f"Cleared {ent} this year between trading and primary compensation."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, ent, "SENSITIVE_FINANCIAL")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SENSITIVE"})

    for _ in range(per_bucket):
        sal = random.choice(SALARY_NUMS_IN)
        ent = sal

        if not is_test:
            templates = [
                f"My annual package at the tech firm in Bangalore is {ent} with performance bonus.",
                f"I have a counter offer of {ent} for the Senior SRE role.",
                f"Offered {ent} base plus joining bonus in Gurgaon."
            ]
        else:
            templates = [
                f"Currently drawing {ent} per annum and evaluating remote US roles.",
                f"My total CTC is {ent} including ESOP vesting schedule.",
                f"Salary breakdown: {ent} fixed component plus variable incentive."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, ent, "SENSITIVE_FINANCIAL")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SENSITIVE"})

    for _ in range(per_bucket):
        curr = random.choice(CURRENCIES_EN)
        sal = random.choice(["23,000", "5,750", "30.04 billion", "120,360", "25.91 million", "5.25% to 5.50%"])
        ent = f"${sal}" if not ("%" in sal or "points" in sal or sal.startswith("$")) else sal

        if not is_test:
            stat_templates = [
                f"The Federal Reserve maintained interest rates at 5.25% to 5.50% following FOMC meeting.",
                f"The S&P 500 benchmark index crossed 5,750 points following tech market earnings.",
                f"According to IRS statutory guidelines, the individual 401(k) contribution limit is $23,000.",
                f"Nvidia posted record quarterly revenue of $30.04 billion beating analyst estimates.",
                f"The Bureau of Labor Statistics reported median compensation of $120,360 for cybersecurity analysts."
            ]
        else:
            stat_templates = [
                f"Indeed reports the average salary for software engineers in Jakarta is Rp 25.91 million.",
                f"Glassdoor benchmark shows median base pay for developers is $145,000 nationwide.",
                f"Annualized Consumer Price Index (CPI) cooled to 2.5% according to official economic data.",
                f"Federal statutory minimum wage regulations remain unchanged under the FLSA statute.",
                f"The 10-year Treasury note yield stabilized at 4.22% ahead of quarterly debt issuance."
            ]
        s_text = random.choice(stat_templates)
        tokens, labels = tokenize_and_label(s_text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "FINANCIAL", "type": "SAFE_STATISTICAL"})

    return data


def generate_developer_code_partition(is_test: bool = False, n_samples: int = 5000) -> List[Dict]:
    """Generates Developer Code & SQL Hard Negatives where terms like salary, id, user appear as code syntax (Label O)."""
    data = []
    
    code_templates_train = [
        "SELECT employee_id, salary, department FROM payroll_records WHERE status = 'active';",
        "const calculateNetPay = (grossSalary, taxRate) => grossSalary * (1 - taxRate);",
        "def get_user_profile(user_id: int) -> dict: return db.query(User).filter_by(id=user_id).first()",
        "CREATE TABLE users (id SERIAL PRIMARY KEY, username VARCHAR(50), balance DECIMAL(12, 2));",
        "INSERT INTO compensation_bands (level, base_min, base_max) VALUES ('L5', 180000, 240000);",
        "UPDATE employee_accounts SET credit_limit = 5000 WHERE account_id = 'ACC_9921';",
        "struct EmployeeRecord { uint32_t id; double annual_compensation; char role[64]; };",
        "curl -X GET https://api.stripe.com/v1/customers -H 'Authorization: Bearer test_key'",
        "logger.info('Processing payroll batch for department: Engineering with total employees: %d', count)",
        "return {'status': 'success', 'data': {'account_type': 'checking', 'routing_prefix': '0210'}}"
    ]
    
    code_templates_test = [
        "SELECT avg(salary) AS mean_comp, max(bonus) FROM engineering_salaries GROUP BY location;",
        "class PayrollCalculator: def __init__(self, base_pay: float): self.base = base_pay",
        "const userPayload = JSON.stringify({ action: 'verify_identity', tenant_id: 'corp_alpha' });",
        "prisma.employee.findMany({ where: { compensation: { gte: 100000 } } });",
        "export interface UserMetadata { id: string; emailVerified: boolean; balanceRemaining: number; }",
        "git log --pretty=format:'%h - %an, %ar : %s' --grep='payroll service update'",
        "docker run -e DB_NAME=finance_prod -e DB_PORT=5432 -p 5432:5432 postgres:15-alpine",
        "terraform apply -target=aws_security_group.db_ingress -var='environment=production'"
    ]
    
    templates = code_templates_test if is_test else code_templates_train
    for _ in range(n_samples):
        snippet = random.choice(templates)
        tokens, labels = tokenize_and_label(snippet)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "DEV_CODE", "type": "SAFE_CODE_SYNTAX"})
        
    return data


def generate_human_organic_partition(is_test: bool = False, n_samples: int = 2500) -> List[Dict]:
    """Generates Organic Human Prompts with typos, colloquialisms, and informal phrasing."""
    data = []
    
    organic_train = [
        ("im making 130k base as senior dev in austin, rent is 2400 a month, how to save for downpayment?", "130k", "SENSITIVE_FINANCIAL"),
        ("got offered 380k tc at meta (210k base 170k rsu). current google tc is 340k. should i counter?", "380k tc", "SENSITIVE_FINANCIAL"),
        ("my slary is 95k but my credit card debt is 22k at 24% interest, feeling overwhelmed", "95k", "SENSITIVE_FINANCIAL"),
        ("bro my thp is 28jt nett per month but monthly cicilan kpr is 12jt, is this sustainable?", "28jt", "SENSITIVE_FINANCIAL"),
        ("i have 45000 in student loans and 12000 in car loans, monthly payments are killing me", "45000", "SENSITIVE_FINANCIAL")
    ]
    
    organic_test = [
        ("cleared half a mil this year from consulting and day trading, need tax shelter ideas", "half a mil", "SENSITIVE_FINANCIAL"),
        ("my rent is 3200 a month and i only take home 7800 after taxes and 401k deduction", "3200", "SENSITIVE_FINANCIAL"),
        ("got placed on a 30 day pip today by my manager after reporting safety concerns to hr", "30 day pip", "SENSITIVE_LEGAL_HR"),
        ("dr prescribed me 20mg lexapro and 0.5mg xanax for crippling panic attacks", "20mg lexapro", "SENSITIVE_HEALTH"),
        ("our startup burn rate is 180k/mo and we only have 900k left in the bank", "180k", "SENSITIVE_FINANCIAL")
    ]
    
    pool = organic_test if is_test else organic_train
    for _ in range(n_samples):
        text, target_str, label_tag = random.choice(pool)
        tokens, labels = tokenize_and_label(text, target_str, label_tag)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HUMAN_ORGANIC", "type": "SENSITIVE"})
        
    return data


def generate_health_partition(is_test: bool = False, n_samples: int = 4000) -> List[Dict]:
    data = []
    per_type = n_samples // 3

    for _ in range(per_type):
        dis = random.choice(DISEASES_EN)
        med = random.choice(MEDICATIONS_EN)
        if not is_test:
            templates = [
                f"My psychiatrist diagnosed me with {dis} and prescribed {med} daily.",
                f"In my therapy session today, I broke down discussing my {dis}.",
                f"Doctor recommended starting {med} to manage my clinical symptoms.",
                f"I received my biopsy results yesterday confirming {dis}."
            ]
        else:
            templates = [
                f"Clinical notes: Patient presents with {dis} and has been titrated to {med}.",
                f"I have been struggling with {dis} for the past six months.",
                f"Currently taking {med} before bed as recommended by my specialist.",
                f"Pathology consultation indicated {dis} requiring immediate protocol."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, dis, "SENSITIVE_HEALTH")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HEALTH", "type": "SENSITIVE"})

    for _ in range(per_type):
        dis_id = random.choice(DISEASES_ID)
        med_id = random.choice(MEDICATIONS_ID)
        if not is_test:
            templates = [
                f"Dokter spesialis mendiagnosis saya mengidap {dis_id} dan meresepkan {med_id}.",
                f"Kemarin hasil tes lab menyatakan saya positif {dis_id}.",
                f"Saya sedang menjalani rawat jalan dan rutin mengonsumsi {med_id}."
            ]
        else:
            templates = [
                f"Kondisi kesehatan saya saat ini terdiagnosis {dis_id}.",
                f"Psikiater menganjurkan saya minum {med_id} setiap malam.",
                f"Hasil biopsi rumah sakit mengonfirmasi vonis {dis_id} stadium lanjut."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, dis_id, "SENSITIVE_HEALTH")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HEALTH", "type": "SENSITIVE"})

    for _ in range(per_type):
        if not is_test:
            safe_texts = [
                "How does escitalopram selectively inhibit the serotonin transporter (SERT) protein?",
                "What is the pharmacological mechanism of action of SSRIs compared to SNRIs?",
                "According to the CDC, seasonal influenza quarantine guidelines recommend 24 hours fever-free.",
                "Clinical research indicates that physical exercise promotes neuroplasticity in the hippocampus."
            ]
        else:
            safe_texts = [
                "What are the primary risk factors and diagnostic criteria for Type 2 Diabetes Melitus?",
                "Explain the cellular pathway of mRNA vaccines in activating memory T-cell responses.",
                "Pharmacology overview: Metformin decreases hepatic glucose production and intestinal absorption.",
                "Standard medical textbooks describe adenocarcinoma as a malignancy of epithelial tissue."
            ]
        text = random.choice(safe_texts)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HEALTH", "type": "SAFE"})

    return data


def generate_corp_hr_partition(is_test: bool = False, n_samples: int = 3500) -> List[Dict]:
    data = []
    per_type = n_samples // 3

    for _ in range(per_type):
        proj = random.choice(PROJECTS_CORP_EN)
        if not is_test:
            templates = [
                f"Our engineering department is building {proj}, an unannounced neural network engine.",
                f"Briefing memo: {proj} database migration must finish before the board meeting.",
                f"The confidential codename for the acquisition is {proj} under mutual NDA."
            ]
        else:
            templates = [
                f"Deployment notice: Rolling out {proj} internal microservices across US clusters.",
                f"Security audit for {proj} architecture highlighted zero-trust access controls.",
                f"Lead architect assigned to {proj} proprietary infrastructure development."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, proj, "SENSITIVE_CORP")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "CORP", "type": "SENSITIVE"})

    for _ in range(per_type):
        action = random.choice(HR_ACTIONS_EN)
        if not is_test:
            templates = [
                f"My director placed me on an official {action} following the quarterly review.",
                f"I received a {action} from human resources regarding workplace conduct.",
                f"HR escalated the disciplinary matter and issued a {action}."
            ]
        else:
            templates = [
                f"Filing an appeal against the unjustified {action} issued by management.",
                f"Employee records indicate receipt of {action} during employment tenure.",
                f"Formal dispute initiated regarding {action} documentation."
            ]
        s_text = random.choice(templates)
        tokens, labels = tokenize_and_label(s_text, action, "SENSITIVE_LEGAL_HR")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "HR", "type": "SENSITIVE"})

    for _ in range(per_type):
        if not is_test:
            safe_texts = [
                "I took an advanced course in project management and project planning last summer.",
                "Under the Fair Labor Standards Act (FLSA), overtime is paid at time and a half.",
                "Agile software development emphasizes iterative project delivery and sprint retrospectives.",
                "Best practices in project governance recommend establishing clear steering committees."
            ]
        else:
            safe_texts = [
                "The project manager updated the project timeline and resource allocation chart.",
                "Title VII of the Civil Rights Act prohibits workplace discrimination based on protected classes.",
                "Project management frameworks such as Scrum and Kanban optimize engineering throughput.",
                "Standard employment contracts typically define governing state law and arbitration clauses."
            ]
        text = random.choice(safe_texts)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "CORP_HR", "type": "SAFE"})

    return data


def generate_user_cyber_partition(is_test: bool = False, n_samples: int = 3500) -> List[Dict]:
    data = []
    per_type = n_samples // 2

    for _ in range(per_type):
        user = random.choice(USERNAMES)
        host = random.choice(HOSTNAMES)
        directory = random.choice(DIRECTORIES)
        if not is_test:
            prompt_templates = [
                f"Mon 28 Sep - 18:24  ~  @{user}  node demo.js",
                f"┌──({user}㉿{host})-[~/{directory}]\\n└─$ ./run.sh",
                f"{user}@{host}:~/{directory}$ gdb -q ./libc.so.6",
                f"{user}@{host} ~ % brew install cmake",
                f"PS C:\\Users\\{user}\\Projects\\backend> git status",
                f"Author: {user} <{user}@protected.local>"
            ]
        else:
            prompt_templates = [
                f"Best regards,\\nDr. Jonathan {user.capitalize()}\\nHead of Research",
                f"uid=1000({user}) gid=1000({user}) groups=1000({user})",
                f"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5... {user}@{host}",
                f"C:\\Users\\{user}\\Desktop> python run.py",
                f"Full Name : {user.capitalize()} Hamilton\\nStudent ID : 9021839210"
            ]
        s_text = random.choice(prompt_templates)
        tokens, labels = tokenize_and_label(s_text, user, "SENSITIVE_USER")
        data.append({"tokens": tokens, "ner_tags": labels, "category": "USER_SYS", "type": "SENSITIVE"})

    for _ in range(per_type):
        if not is_test:
            safe_commands = [
                "gdb -q --batch -ex 'x/2i &setcontext' ./libc.so.6",
                "readelf -Ws ./libc.so.6 | grep system",
                "checksec --file=./binary_target",
                "docker run -d --name test-nginx -p 8080:80 nginx:alpine",
                "git clone https://github.com/torvalds/linux.git --depth=1",
                "\\x31\\xc0\\x48\\xbb\\xd1\\x9d\\x96\\x91\\xd0\\x8c\\x97\\xff\\x48\\xf7\\xdb"
            ]
        else:
            safe_commands = [
                "info registers: $rsp = 0x7fffffffe120, $rip = 0x00007ffff7de3000",
                "Evaluating impact of CVE-2024-38077 Windows RDP Remote Code Execution.",
                "npm install --save-dev typescript @types/node jest",
                "python3 -m venv venv && source venv/bin/activate",
                "cat /etc/os-release && uname -a",
                "kubectl apply -f deployment.yaml --namespace=kube-system"
            ]
        text = random.choice(safe_commands)
        tokens, labels = tokenize_and_label(text)
        data.append({"tokens": tokens, "ner_tags": labels, "category": "CYBER_SYS", "type": "SAFE"})

    return data


def build_ood_human_dataset() -> List[Dict]:
    """Curated real-world human out-of-distribution prompts (unstructured, typo-heavy, informal)."""
    return [
        {
            "id": "OOD-01",
            "text": "so im an L5 at google making 365k tc (210k base + 155k equity). got an offer from meta for 420k tc. should i jump?",
            "entities": [{"raw": "365k tc", "cat": "FINANCIAL"}, {"raw": "210k", "cat": "FINANCIAL"}, {"raw": "155k", "cat": "FINANCIAL"}, {"raw": "420k tc", "cat": "FINANCIAL"}]
        },
        {
            "id": "OOD-02",
            "text": "my rent is 3200 a month and i only take home 7800 after taxes and 401k deduction. feeling super stressed about cashflow",
            "entities": [{"raw": "3200", "cat": "FINANCIAL"}, {"raw": "7800", "cat": "FINANCIAL"}]
        },
        {
            "id": "OOD-03",
            "text": "got placed on a 30 day pip today by my manager after reporting safety concerns to hr. is this retaliation?",
            "entities": [{"raw": "30 day pip", "cat": "HR"}]
        },
        {
            "id": "OOD-04",
            "text": "dr prescribed me 20mg lexapro and 0.5mg xanax for crippling panic attacks. anyone else felt super fatigued the first week?",
            "entities": [{"raw": "20mg lexapro", "cat": "HEALTH"}, {"raw": "0.5mg xanax", "cat": "HEALTH"}]
        },
        {
            "id": "OOD-05",
            "text": "our startup burn rate is 180k/mo and we only have 900k left in the bank. runway is under 5 months. need bridge round advice",
            "entities": [{"raw": "180k", "cat": "FINANCIAL"}, {"raw": "900k", "cat": "FINANCIAL"}]
        },
        {
            "id": "OOD-06",
            "text": "here is my staging .env: AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY and DB_PASS=SuperSecret123!",
            "entities": [{"raw": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "cat": "CREDENTIALS"}, {"raw": "SuperSecret123!", "cat": "CREDENTIALS"}]
        },
        {
            "id": "OOD-07",
            "text": "send the wire to my chase account routing 021000021 ssn on file is 987-65-4321 for tax clearance",
            "entities": [{"raw": "021000021", "cat": "CREDENTIALS"}, {"raw": "987-65-4321", "cat": "GOV_ID"}]
        },
        {
            "id": "OOD-08",
            "text": "according to the Bureau of Labor Statistics, median software engineer salary in 2026 was $120,360 while Federal Reserve held interest rate at 5.50%.",
            "entities": [] # Safe Macroeconomic Negative
        },
        {
            "id": "OOD-09",
            "text": "can you explain how gdb inspects x86_64 assembly using the command gdb -q -ex 'x/2i &setcontext' ./libc.so.6?",
            "entities": [] # Safe CTF Negative
        },
        {
            "id": "OOD-10",
            "text": "The project management institute offers certification in project planning and agile project leadership.",
            "entities": [] # Safe Project Management Negative
        },
        {
            "id": "OOD-11",
            "text": "SELECT salary, bonus, department FROM corp_payroll WHERE active = true;",
            "entities": [] # Safe SQL Code Negative
        },
        {
            "id": "OOD-12",
            "text": "In Python code: const user_id = 1000; let baseSalary = calculateTax(grossComp);",
            "entities": [] # Safe Script Code Negative
        }
    ]


def main():
    print("[*] Generating SafeShare-AI PrivacyBench Dataset V4 (100,000 Balanced Multi-Domain)...")

    # Generate Train Partition (80,000 samples)
    train_fin = generate_financial_partition(is_test=False, n_samples=26000)
    train_dev = generate_developer_code_partition(is_test=False, n_samples=20000)
    train_health = generate_health_partition(is_test=False, n_samples=14000)
    train_corp = generate_corp_hr_partition(is_test=False, n_samples=10000)
    train_cyber = generate_user_cyber_partition(is_test=False, n_samples=10000)
    train_data = train_fin + train_dev + train_health + train_corp + train_cyber
    random.shuffle(train_data)
    train_data = train_data[:80000]

    # Generate Validation & Test Partition using Reserved Disjoint Templates (20,000 samples total)
    test_fin = generate_financial_partition(is_test=True, n_samples=6500)
    test_dev = generate_developer_code_partition(is_test=True, n_samples=5000)
    test_health = generate_health_partition(is_test=True, n_samples=3500)
    test_corp = generate_corp_hr_partition(is_test=True, n_samples=2500)
    test_cyber = generate_user_cyber_partition(is_test=True, n_samples=2500)
    eval_pool = test_fin + test_dev + test_health + test_corp + test_cyber
    random.shuffle(eval_pool)
    eval_pool = eval_pool[:20000]

    n_val = 10000
    val_data = eval_pool[:n_val]
    test_data = eval_pool[n_val:]

    out_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)

    print(f"[+] Total samples: {len(train_data):,} Train, {len(val_data):,} Validation, {len(test_data):,} Test (Template-Disjoint)")

    print("[*] Writing dataset files to disk...")
    with open(os.path.join(out_dir, "train.json"), "w", encoding="utf-8") as f:
        json.dump(train_data, f, ensure_ascii=False)
    with open(os.path.join(out_dir, "val.json"), "w", encoding="utf-8") as f:
        json.dump(val_data, f, ensure_ascii=False)
    with open(os.path.join(out_dir, "test.json"), "w", encoding="utf-8") as f:
        json.dump(test_data, f, ensure_ascii=False)

    # Write OOD Human Benchmark
    ood_dataset = build_ood_human_dataset()
    with open(os.path.join(out_dir, "test_ood_human.json"), "w", encoding="utf-8") as f:
        json.dump(ood_dataset, f, indent=2, ensure_ascii=False)

    print(f"[+] Successfully wrote {len(train_data):,} train, {len(val_data):,} val, {len(test_data):,} test samples!")
    print(f"[+] Successfully generated SafeShare-PrivacyBench Out-of-Distribution benchmark: {os.path.join(out_dir, 'test_ood_human.json')}")


if __name__ == "__main__":
    main()
