"""Usage: python tools/make_demo_gif.py [--relay http://127.0.0.1:8787]

Renders docs/demo.gif from the real output of the demo commands. The share step
is included only if a relay is reachable at --relay.
"""
import os
import subprocess
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, PAD, LINE = 1100, 620, 18, 19
BG, FG, DIM, ACCENT, PROMPT = (17, 19, 24), (220, 223, 228), (130, 136, 148), (110, 200, 140), (120, 170, 255)


def font(size):
    for name in ("consola.ttf", "DejaVuSansMono.ttf", "Menlo.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


FONT = font(15)
COLS = (W - 2 * PAD) // int(FONT.getlength("m"))


def run(cmd):
    out = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True, encoding="utf-8")
    return (out.stdout + out.stderr).rstrip("\n")


def wrap(text):
    lines = []
    for raw in text.split("\n"):
        while len(raw) > COLS:
            lines.append(raw[:COLS])
            raw = "  " + raw[COLS:]
        lines.append(raw)
    return lines


def render(lines):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    y = PAD
    for kind, text in lines[-((H - 2 * PAD) // LINE):]:
        color = {"cmd": PROMPT, "note": DIM, "hit": ACCENT}.get(kind, FG)
        d.text((PAD, y), text, font=FONT, fill=color)
        y += LINE
    return img


def main():
    relay = sys.argv[sys.argv.index("--relay") + 1] if "--relay" in sys.argv else "http://127.0.0.1:8787"
    try:
        urllib.request.urlopen(relay, timeout=2)
        has_relay = True
    except OSError:
        has_relay = False

    scenes = [
        ("# A chat where only the salary was redacted:", "cat examples/chat_naive_redacted_en.txt"),
        ("# The inversion attack recovers it from the assistant's numbers:", "node bin/safeshare.js invert examples/chat_naive_redacted_en.txt"),
        ("# Same chat, redacted by SafeShare (derived numbers removed too):", "node bin/safeshare.js redact examples/chat_original_en.txt"),
        (None, "node bin/safeshare.js redact examples/chat_original_en.txt | node bin/safeshare.js invert"),
    ]
    if has_relay:
        scenes.append(("# Share it: encrypted locally, key stays in the #fragment, burns after one read:",
                       f"node bin/safeshare.js share examples/chat_original_en.txt --burn --ttl 600 --relay {relay}"))

    frames, durations, screen = [], [], []

    def snap(ms):
        frames.append(render(screen))
        durations.append(ms)

    for note, cmd in scenes:
        if note:
            screen.append(("note", ""))
            screen.append(("note", note))
        typed = "$ "
        for i in range(0, len(cmd), 6):
            typed = "$ " + cmd[: i + 6]
            snap_line = ("cmd", typed[:COLS])
            if screen and screen[-1][0] == "cmd" and screen[-1][1].startswith("$ ") and i:
                screen[-1] = snap_line
            else:
                screen.append(snap_line)
            snap(40)
        output = run(cmd)
        if "revoke" in output.lower():
            output = "\n".join(l for l in output.split("\n") if not l.strip().startswith(("curl", "Revoke:")))
        for line in wrap(output):
            hit = line.startswith("Most likely") or line.startswith("No hidden") or line.strip().startswith("http")
            screen.append(("hit" if hit else "out", line))
        snap(3500)
    durations[-1] = 6000

    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    out = os.path.join(ROOT, "docs", "demo.gif")
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    print(f"{out}: {len(frames)} frames, {sum(durations) / 1000:.0f}s, relay step {'on' if has_relay else 'off'}")


if __name__ == "__main__":
    main()
