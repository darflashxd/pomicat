"""Writes category_gold.jsonl: a small fictional development set, one category per row.

It holds the kinds of values found in manual testing (loans, hourly pay, connection strings,
IDs written after a label) plus safe sentences that must come through unchanged. It is a
development set, not a held-out benchmark: rules were tuned on cases like these.
Run: python tools/eval/build_category_gold.py
"""
import json
from pathlib import Path

ROWS = {
    "CREDENTIAL": [
        ("My password is Tr0ub4dor&3 for the staging box.", ["Tr0ub4dor&3"]),
        ("psql postgresql://admin:S3cretPass@10.0.0.20:5432/app", ["S3cretPass"]),
        ("DATABASE_URL=postgres://app:Kq8zr2Lw7@db.internal:5432/prod", ["Kq8zr2Lw7"]),
        ("REDIS_URL=redis://:hunter2pw@cache.local:6379/0", ["hunter2pw"]),
        ("export API_TOKEN=a7F3kQ9zX2mV8pL4", ["a7F3kQ9zX2mV8pL4"]),
        ("curl -u deploy:Wint3rIsComing! https://ci.example.com/api", ["Wint3rIsComing!"]),
        ("mysql -u root -pRootPass2026 shop", ["RootPass2026"]),
        ("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", ["wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"]),
        ("Authorization: Basic YWRtaW46c3VwZXJzZWNyZXQ=", ["YWRtaW46c3VwZXJzZWNyZXQ="]),
        ("kata sandi wifi saya Bandung2026!", ["Bandung2026!"]),
        ("My backup codes are 4829-1734 and 9917-2203.", ["4829-1734", "9917-2203"]),
        ("The OTP is 482913, don't share it.", ["482913"]),
    ],
    "GOV_ID": [
        ("NIK saya 3201012304950001.", ["3201012304950001"]),
        ("My SSN is 512-48-3907.", ["512-48-3907"]),
        ("My Dutch BSN is 111222333", ["111222333"]),
        ("My passport number is X12345678.", ["X12345678"]),
        ("NPWP saya 09.254.294.3-407.000", ["09.254.294.3-407.000"]),
        ("My Aadhaar is 2345 6789 0123.", ["2345 6789 0123"]),
        ("My National Insurance number is AB 12 34 56 C.", ["AB 12 34 56 C"]),
        ("My driver's license number is D1234567.", ["D1234567"]),
        ("My Brazilian CPF is 123.456.789-09", ["123.456.789-09"]),
    ],
    "BANK_CARD": [
        ("My card is 4111 1111 1111 1111.", ["4111 1111 1111 1111"]),
        ("The CVV is 123 on the back.", ["123"]),
        ("My IBAN is DE89370400440532013000.", ["DE89370400440532013000"]),
        ("Transfer to my BCA account number 0123456789.", ["0123456789"]),
        ("Sort code 12-34-56, account 12345678.", ["12-34-56", "12345678"]),
        ("The remaining funds go to my bank account DEMO-ACCT-8392.", ["DEMO-ACCT-8392"]),
    ],
    "CONTACT": [
        ("Email me at rina.kusuma@example.com.", ["rina.kusuma@example.com"]),
        ("My phone is +62 812 3456 7890.", ["+62 812 3456 7890"]),
        ("Call me on (415) 555-0134 after six.", ["(415) 555-0134"]),
        ("my email is maya.pratama@example.com", ["maya.pratama@example.com"]),
        ("WhatsApp saya 0812-3456-7890", ["0812-3456-7890"]),
    ],
    "PERSONAL_MONEY": [
        ("My salary is $5,000 a month.", ["$5,000"]),
        ("I get paid $42 an hour, about 30 hours a week.", ["$42"]),
        ("Please review my loan. The approved loan is Rp480,000,000.", ["Rp480,000,000"]),
        ("My outstanding debt with another lender is Rp95,000,000.", ["Rp95,000,000"]),
        ("Gaji saya Rp 12.500.000 per bulan.", ["Rp 12.500.000"]),
        ("My rent is $1,200 and I want to save more.", ["$1,200"]),
        ("I have $14,000 in savings and $3,000 in debt.", ["$14,000", "$3,000"]),
        ("I earn ₹1,20,000 a month.", ["₹1,20,000"]),
        ("My salary is fifteen thousand dollars a month.", ["fifteen thousand dollars"]),
        ("My mortgage payment is $2,150 a month until 2040.", ["$2,150"]),
    ],
    "ADDRESS": [
        ("I live at 742 Evergreen Terrace, Springfield.", ["742 Evergreen Terrace"]),
        ("Please ship it to 221B Baker Street, London.", ["221B Baker Street"]),
        ("Alamat saya Jl. Merdeka No. 12, Bandung.", ["Jl. Merdeka No. 12"]),
        ("I'm at 1600 Amphitheatre Parkway, Mountain View.", ["1600 Amphitheatre Parkway"]),
    ],
    "AGE_DOB": [
        ("I was born on 14 March 1998.", ["14 March 1998"]),
        ("I'm 28 years old and want to learn piano.", ["28"]),
        ("My son is aged 7.", ["7"]),
    ],
    "NAME": [
        ("My name is Maya Pratama.", ["Maya Pratama"]),
        ("Hi, I'm Jane Doe from the finance team.", ["Jane Doe"]),
        ("Nama saya Rina Kusuma.", ["Rina Kusuma"]),
    ],
    "SAFE": [
        ("The average barista earns $15 an hour.", []),
        ("I paid $42 for dinner.", []),
        ("What is the weather like in Bandung today?", []),
        ("Port 5432 is the Postgres default.", []),
        ("Apple's revenue was $383 billion in 2023.", []),
        ("Use version 3.0.2 of the library.", []),
        ("HTTP 503 means service unavailable.", []),
        ("Run npm install, then npm test.", []),
        ("The meeting is at 10:30 on Monday.", []),
        ("A 30% tip on a $50 bill is $15.", []),
        ("Python 3.12 added better error messages.", []),
        ("The Eiffel Tower is 330 metres tall.", []),
        ("Set the timeout to 5000 ms.", []),
        ("Indonesia has about 280 million people.", []),
        ("Banks often charge an administration fee of 1% on a typical loan.", []),
    ],
}

out = Path(__file__).with_name("category_gold.jsonl")
with out.open("w", encoding="utf-8", newline="\n") as f:
    for label, rows in ROWS.items():
        for i, (text, values) in enumerate(rows, 1):
            for v in values:
                assert v in text, (label, text, v)
            f.write(json.dumps({"id": f"{label.lower()}_{i}", "category": label, "source_text": text,
                                "privacy_mask": [{"value": v, "label": label} for v in values]}, ensure_ascii=False) + "\n")
print(f"wrote {sum(len(r) for r in ROWS.values())} rows to {out}")
