"""Build one realistic, fictional compensation-review DOCX for Word Online testing.

All visible text is forced to pure black so the document does not look like
default Word theme output or an AI-generated template.

  python tools/build_priority_docx.py --output .playwright-mcp/priority
  python tools/build_priority_docx.py --self-check
"""
import argparse
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
BLACK = RGBColor(0, 0, 0)
SENTINEL = "End of review - DOC-CR-2026-0417"
COMPANY = "Northbridge Advisory"
CONTROL = "DOC-CR-2026-0417"


def face(size):
    for name in ("times.ttf", "DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def payroll_capture(path):
    image = Image.new("RGB", (1300, 620), "#ffffff")
    draw = ImageDraw.Draw(image)
    draw.text((40, 32), "Payroll self-service  |  " + COMPANY, font=face(30), fill="#000000")
    draw.line((40, 86, 1260, 86), fill="#000000", width=2)
    rows = [
        "Employee:      A. Whitfield",
        "Sign-in:       a.whitfield@example.invalid",
        "Password:      Welcome2026!",
        "Monthly base:  4,800.00 USD",
        "Bonus target:  960.00 USD",
    ]
    for index, row in enumerate(rows):
        draw.text((40, 130 + index * 76), row, font=face(24), fill="#000000")
    draw.rectangle((36, 430, 1264, 566), outline="#000000", width=2)
    draw.text((56, 458), "Notice: temporary password must be changed after first sign-in.",
              font=face(22), fill="#000000")
    draw.text((56, 500), "Local screenshot. Credential is fictional and non-functional.",
              font=face(22), fill="#000000")
    image.save(path)


def black(run, size=None, bold=None):
    run.font.color.rgb = BLACK
    run.font.name = "Times New Roman"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    return run


def para(doc, text="", size=11, bold=False, space_after=8, align=None):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(space_after)
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.15
    if align is not None:
        paragraph.alignment = align
    if text:
        black(paragraph.add_run(text), size, bold)
    return paragraph


def heading(doc, text):
    paragraph = para(doc, space_after=6)
    paragraph.paragraph_format.space_before = Pt(14)
    black(paragraph.add_run(text), 12, True)
    return paragraph


def memo_row(table, label, value):
    cells = table.add_row().cells
    cells[0].width = Inches(1.1)
    black(cells[0].paragraphs[0].add_run(label), 10, True)
    black(cells[1].paragraphs[0].add_run(value), 11, False)


def page_field(paragraph):
    """PAGE field: begin, instruction and end must each live in their own run."""
    black(paragraph.add_run("Page "), 8)
    begin = black(paragraph.add_run(), 8)
    start = OxmlElement("w:fldChar"); start.set(qn("w:fldCharType"), "begin")
    begin._r.append(start)
    instr = black(paragraph.add_run(), 8)
    code = OxmlElement("w:instrText"); code.set(qn("xml:space"), "preserve"); code.text = " PAGE "
    instr._r.append(code)
    end = black(paragraph.add_run(), 8)
    finish = OxmlElement("w:fldChar"); finish.set(qn("w:fldCharType"), "end")
    end._r.append(finish)


def build(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise FileExistsError(f"Refusing to write into non-empty directory: {output}")
    shot = output / "payroll-portal.png"
    payroll_capture(shot)

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(11)
    normal.font.color.rgb = BLACK
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.15

    for section in doc.sections:
        section.top_margin = section.bottom_margin = Inches(0.9)
        section.left_margin = section.right_margin = Inches(1.0)
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        black(footer.add_run("Confidential - internal draft    |    "), 8)
        page_field(footer)

    props = doc.core_properties
    props.author = "People Operations"
    props.title = "Employee Compensation Review"
    props.subject = "Confidential - fictional test document"
    props.comments = "Contains fictional data only. Not a real employee record."
    props.category = "Internal"

    black(para(doc, space_after=2).add_run(f"{COMPANY} - People Operations"), 11)
    black(para(doc, space_after=18).add_run("Employee Compensation Review, 2026"), 16, True)

    memo = doc.add_table(rows=0, cols=2)
    memo.autofit = False
    layout = OxmlElement("w:tblLayout"); layout.set(qn("w:type"), "fixed")
    memo._tbl.tblPr.append(layout)
    for column, width in zip(memo.columns, [Inches(1.15), Inches(5.0)]):
        column.width = width
    for label, value in [
        ("To", "Compensation Committee"),
        ("From", "People Operations"),
        ("Date", "14 March 2026"),
        ("Subject", "Proposed salary adjustments for the advisory practice"),
        ("Reference", CONTROL),
    ]:
        memo_row(memo, label, value)

    heading(doc, "1. Purpose")
    para(doc, "This note summarizes the proposed base salary and bonus targets for three advisory "
              "staff, and records the resulting cost to the practice. Figures are monthly and in U.S. "
              "dollars unless stated otherwise.")
    para(doc, "The review follows the January benchmarking exercise against comparable regional "
              "firms. No headcount change is proposed in this cycle.")

    heading(doc, "2. Proposed adjustments")
    para(doc, "The table below reflects the position after moderation by the committee chair. Bonus "
              "figures are the target amounts for a full year of service.")
    table = doc.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Employee", "Role", "Base salary", "Bonus target", "Monthly total"]
    for cell, text in zip(table.rows[0].cells, headers):
        black(cell.paragraphs[0].add_run(text), 10, True)
    rows = [
        ("A. Whitfield", "Senior Analyst", "4,800", "960", "5,760"),
        ("M. Okafor", "Analyst", "3,600", "540", "4,140"),
        ("R. Haddad", "Associate", "2,900", "290", "3,190"),
        ("Total", "", "11,300", "1,790", "13,090"),
    ]
    for index, row in enumerate(rows):
        cells = table.add_row().cells
        for position, text in enumerate(row):
            paragraph = cells[position].paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT if position >= 2 else WD_ALIGN_PARAGRAPH.LEFT
            black(paragraph.add_run(text), 10, index == len(rows) - 1)
    widths = [Inches(1.2), Inches(1.3), Inches(1.0), Inches(1.0), Inches(1.1)]
    for row in table.rows:
        for cell, width in zip(row.cells, widths):
            cell.width = width

    heading(doc, "3. Illustrative saving scenario")
    para(doc, "For illustration, an employee on the senior analyst base salary who commits 20 percent "
              "of gross pay to a savings plan would set aside 960 dollars each month, or 11,520 dollars "
              "across a year. The scenario is indicative and is not a commitment under the plan rules.")
    para(doc, "The arithmetic is straightforward: 20 percent of 4,800 is 960, and twelve monthly "
              "contributions give 11,520. Deductions and tax are outside the scope of this note.")

    heading(doc, "4. Supporting evidence")
    para(doc, "The extract below was taken from the payroll self-service portal during the review. "
              "Access details shown in the image are temporary and have since been reset.")
    doc.add_picture(str(shot), width=Inches(6.0))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

    heading(doc, "5. Recommendation")
    para(doc, "The committee is invited to approve the three adjustments as presented, effective from the "
              "April payroll run. People Operations will confirm the revised letters and update the "
              "establishment record.")
    para(doc, "Queries on the figures should be raised before the March meeting so that any correction "
              "can be reflected in the same cycle.")

    closing = para(doc, space_after=4)
    closing.paragraph_format.space_before = Pt(12)
    black(closing.add_run("Prepared by the People Operations team."), 11)
    para(doc, SENTINEL, 10)

    path = output / "Confidential - Employee Compensation Review.docx"
    doc.save(path)
    return path


def verify(path):
    path = Path(path)
    with zipfile.ZipFile(path) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        body = "".join(document.itertext())
        assert SENTINEL in body
        assert "A. Whitfield" in body and "4,800" in body
        assert len(document.findall(f".//{{{W}}}tbl")) == 2
        assert len([n for n in archive.namelist() if n.startswith("word/media/")]) == 1
        for part in ("word/document.xml", "word/footer1.xml"):
            xml = ET.fromstring(archive.read(part))
            for run in xml.findall(f".//{{{W}}}r"):
                if run.find(f"{{{W}}}t") is None:
                    continue
                color = run.find(f".//{{{W}}}color")
                assert color is not None, "visible run without explicit colour"
                assert color.get(f"{{{W}}}val") == "000000", color.get(f"{{{W}}}val")
        assert not any(name.startswith("word/comments") for name in archive.namelist())
    return {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        with tempfile.TemporaryDirectory(prefix="safeshare-priority-") as directory:
            print("Priority document checks passed:", json.dumps(verify(build(directory))))
    elif args.output:
        path = build(args.output)
        print(f"Created {path}")
        print("Checks passed:", json.dumps(verify(path)))
    else:
        parser.error("Choose --output or --self-check")
