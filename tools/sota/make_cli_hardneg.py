#!/usr/bin/env python3
"""Generate CLI/code hard-negative eval set: 5000 lines, every token label O.

Usage: python tools/sota/make_cli_hardneg.py [n=5000] [out=data/cli_hardneg_eval.json]

Covers: docker/k8s flags+ports, git log/hashes, curl/headers, bash, SQL,
stack traces, .env with SAFE values, nginx paths, semver, CVE IDs (public),
public-resolver IPs/CIDRs, hex constants, x86 regs. No real secrets/PII.

Format matches data/train.json rows: {tokens, ner_tags, category, type}.
Seed 1337 for byte-identical output.
"""
import json
import os
import random
import sys

random.seed(1337)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

PORTS = ["80", "443", "5432", "3306", "6379", "8080", "3000", "9200", "27017", "22"]
HASHES = ["4a8f9c1", "a1b2c3f4", "0xdeadbeef", "0x7fff5fbff8c0", "9f86d081884c7d659a2feaa0c55ad015"]
IPS = ["1.1.1.1", "8.8.8.8", "9.9.9.9", "10.24.0.5", "192.168.1.20", "10.8.0.2/24"]
CVES = ["CVE-2024-3094", "CVE-2023-44487", "CVE-2021-44228"]
VERS = ["7.2.4-alpine", "6.8.0-45-generic", "3e-5", "v2.1.0", "1.18.0"]


def lines():
    out = []
    out += [f"docker run -d -p {random.choice(PORTS)}:{random.choice(PORTS)} --name redis-cluster redis:{random.choice(VERS)}" for _ in range(400)]
    out += [f"kubectl -n prod rollout restart deploy/api-{random.randint(1,9)} --port {random.choice(PORTS)}" for _ in range(250)]
    out += [f"git checkout -b fix-auth-{random.randint(10,99)} && git log --oneline -{random.randint(1,9)} {random.choice(HASHES)}" for _ in range(350)]
    out += [f"curl -s -H 'Authorization: Bearer <token>' https://api.internal:8443/v{random.randint(1,3)}/health --max-time {random.randint(5,30)}" for _ in range(300)]
    out += [f"iptables -A INPUT -s {random.choice(IPS)} -p tcp --dport {random.choice(PORTS)} -j ACCEPT" for _ in range(250)]
    out += [f"SELECT id, email, created_at FROM orders WHERE status = 'COMPLETED' LIMIT {random.randint(10,100)};" for _ in range(300)]
    out += [f"EXPLAIN ANALYZE SELECT * FROM users WHERE id = {random.randint(1,9999)};" for _ in range(200)]
    out += [f"node:internal/modules/cjs/loader:{random.randint(100,999)} throw err;_BUILD {random.choice(HASHES)}" for _ in range(200)]
    out += [f"PORT={random.choice(PORTS)} HOST=0.0.0.0 LOG_LEVEL=debug RETRIES={random.randint(1,5)}" for _ in range(250)]
    out += [f"server {{ listen {random.choice(PORTS)}; root /etc/nginx/sites-available/default; }}" for _ in range(200)]
    out += [f"Investigating {random.choice(CVES)} with RFC-{random.randint(1000,9999)} using DNS {random.choice(IPS[:3])}" for _ in range(250)]
    out += [f"ping -c 1 -W 1 {random.choice(IPS)} && echo online || echo offline" for _ in range(200)]
    out += [f"chmod {random.choice(['644','755','600'])} ~/.ssh/config && ssh -p {random.choice(PORTS)} deploy@10.0.0.{random.randint(2,250)}" for _ in range(250)]
    out += [f"tar -xzf release-{random.choice(VERS)}.tgz -C /opt/app --strip-components=1" for _ in range(200)]
    out += [f"python -m pytest tests/ -x -q -k 'not slow' --maxfail={random.randint(1,5)}" for _ in range(200)]
    out += [f"ffmpeg -i input.mp4 -ss 00:0{random.randint(1,9)}:00 -t 30 -c copy out_{random.randint(1,99)}.mp4" for _ in range(150)]
    out += [f"rsync -avz --delete /data/ backup@10.0.0.{random.randint(2,250)}:/backups/{random.randint(2024,2026)}/" for _ in range(150)]
    out += [f"openssl x509 -noout -subject -dates -in cert_{random.randint(1,99)}.pem" for _ in range(150)]
    out += [f"nmap -Pn -p {random.choice(PORTS)} --script smb-os-discovery 10.1.2.{random.randint(2,250)}" for _ in range(200)]
    out += [f"mov rax, {random.choice(HASHES)} ; cmp rbx, 0x{random.randint(10,99)}" for _ in range(150)]
    return out


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, "data", "cli_hardneg_eval.json")
    pool, rows = lines(), []
    random.shuffle(pool)
    for i in range(n):
        toks = pool[i % len(pool)].split(" ")
        rows.append({"tokens": toks, "ner_tags": ["O"] * len(toks),
                     "category": "CODE", "type": "SAFE_HARDNEG"})
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    print(f"{len(rows)} hard-negative rows -> {out_path}")


if __name__ == "__main__":
    main()
