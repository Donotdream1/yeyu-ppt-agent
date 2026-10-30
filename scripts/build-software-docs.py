"""Build the operating manual and traceable source deposit from repository inputs.

Requires python-docx. Production data and user-supplied reference files are never
opened by this reusable builder. Reference measurements are documented separately.
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from docx.image.image import Image

ROOT = Path(__file__).resolve().parents[1]


def font(run, size=10.5, family="微软雅黑", bold=False):
    run.font.name = family
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor(0, 0, 0)
    props = run._element.get_or_add_rPr()
    fonts = props.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        props.insert(0, fonts)
    for name in ("ascii", "hAnsi", "eastAsia", "cs"):
        fonts.set(qn("w:" + name), family)
    return run


def field(paragraph, instruction, cached="1"):
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    text = OxmlElement("w:instrText")
    text.set(qn("xml:space"), "preserve")
    text.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    paragraph.add_run()._r.append(begin)
    paragraph.add_run()._r.append(text)
    paragraph.add_run()._r.append(separate)
    font(paragraph.add_run(cached), 9)
    paragraph.add_run()._r.append(end)


def page_geometry(section, source=False):
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = Cm(1 if source else 2.25)
    section.bottom_margin = Cm(1 if source else 2.15)
    section.left_margin = Cm(3.17 if source else 2.55)
    section.right_margin = Cm(3.17 if source else 2.45)
    section.header_distance = Cm(.55 if source else 1.15)
    section.footer_distance = Cm(.55 if source else 1)


def base_document(name, version, source=False):
    doc = Document()
    page_geometry(doc.sections[0], source)
    doc.core_properties.title = name + " " + version
    doc.core_properties.subject = "源程序鉴别材料" if source else "软件使用说明书"
    doc.core_properties.author = "叙帧项目文档"
    doc.core_properties.last_modified_by = "叙帧项目文档"
    doc.core_properties.comments = ""
    for key in ("Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "Caption"):
        style = doc.styles[key]
        style.font.name = "微软雅黑"
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.font.underline = False
        properties = style._element.get_or_add_rPr()
        if properties.find(qn("w:rFonts")) is None:
            properties.append(OxmlElement("w:rFonts"))
        properties.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    normal = doc.styles["Normal"].paragraph_format
    doc.styles["Normal"].font.size = Pt(10.5)
    normal.line_spacing = Pt(16)
    normal.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
    normal.space_before = Pt(0)
    normal.space_after = Pt(5)
    normal.first_line_indent = Pt(21)
    for key, size in (("Heading 1", 15), ("Heading 2", 12), ("Heading 3", 11)):
        style = doc.styles[key]
        style.font.size = Pt(size)
        style.font.bold = True
        style.paragraph_format.first_line_indent = Pt(0)
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(6)
        style.paragraph_format.keep_with_next = True
    for level in (1, 2):
        key = "toc " + str(level)
        style = doc.styles[key] if key in doc.styles else doc.styles.add_style(key, WD_STYLE_TYPE.PARAGRAPH, builtin=True)
        style.base_style = doc.styles["Normal"]
        style.font.name = "微软雅黑"
        style.font.size = Pt(9.5)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.first_line_indent = Pt(0)
        style.paragraph_format.left_indent = Pt(14 if level == 2 else 0)
        style.paragraph_format.space_before = Pt(0)
        style.paragraph_format.space_after = Pt(0)
        style.paragraph_format.line_spacing = Pt(13)
    for border in list(doc.styles._element.iter(qn("w:pBdr"))):
        border.getparent().remove(border)
    doc.styles["Title"].paragraph_format.first_line_indent = Pt(0)
    doc.styles["Caption"].paragraph_format.first_line_indent = Pt(0)
    settings = doc.settings._element
    update = OxmlElement("w:updateFields")
    update.set(qn("w:val"), "true")
    settings.append(update)
    return doc


def header(section, name, version):
    section.header.is_linked_to_previous = False
    paragraph = section.header.paragraphs[0]
    paragraph.style = "Normal"
    paragraph.paragraph_format.first_line_indent = Pt(0)
    paragraph.paragraph_format.line_spacing = Pt(12)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.tab_stops.add_tab_stop(
        section.page_width - section.left_margin - section.right_margin,
        WD_TAB_ALIGNMENT.RIGHT,
    )
    font(paragraph.add_run(name + " " + version), 9)
    font(paragraph.add_run("\t"), 9)
    field(paragraph, " PAGE ")


def manual(name, version, output, compiled):
    doc = base_document(name, version)
    cover = doc.sections[0]
    cover.different_first_page_header_footer = True
    for text, size, before, after in ((name, 22, 105, 20), (version, 20, 0, 28), ("软件使用说明书", 22, 0, 65), ("软件简称  叙帧", 12, 0, 14), ("软件类型  文档与演示编排软件", 12, 0, 14), ("编制日期  " + compiled.strftime("%Y年%m月%d日"), 12, 0, 0)):
        p = doc.add_paragraph(style="Title" if size >= 20 else None)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Pt(0)
        p.paragraph_format.line_spacing = 1.3
        p.paragraph_format.space_before = Pt(before)
        p.paragraph_format.space_after = Pt(after)
        font(p.add_run(text), size, bold=size >= 20)
    body = doc.add_section(WD_SECTION_START.NEW_PAGE)
    page_geometry(body)
    body.different_first_page_header_footer = False
    header(body, name, version)
    number = OxmlElement("w:pgNumType")
    number.set(qn("w:start"), "1")
    body._sectPr.append(number)
    p = doc.add_paragraph()
    p.paragraph_format.first_line_indent = Pt(0)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(p.add_run("目录"), 16, bold=True)
    toc = doc.add_paragraph()
    toc.paragraph_format.first_line_indent = Pt(0)
    field(toc, ' TOC \\o "1-2" \\h \\z \\u ', "")
    doc.add_page_break()
    lines = (ROOT / "docs/manual/software-manual.md").read_text(encoding="utf8").splitlines()
    active = False
    code = False
    images = 0
    for line in lines:
        if line.startswith("## "):
            active = True
        if not active:
            continue
        if line.startswith("```"):
            code = not code
            continue
        if not line.strip():
            continue
        if code:
            p = doc.add_paragraph()
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.line_spacing = Pt(13)
            p.paragraph_format.space_after = Pt(0)
            font(p.add_run(line), 9, "Consolas")
            continue
        image = re.fullmatch(r"!\[(.+)\]\((.+)\)", line)
        if image:
            caption, relative = image.groups()
            image_path = (ROOT / "docs/manual" / relative).resolve()
            if not image_path.is_relative_to(ROOT / "docs/manual"):
                raise ValueError("Unexpected screenshot path")
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.line_spacing = 1
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(3)
            dimensions = Image.from_file(str(image_path))
            width = min(15.8, 12 * dimensions.px_width / dimensions.px_height)
            shape = p.add_run().add_picture(str(image_path), width=Cm(width))
            shape._inline.docPr.set("descr", caption)
            p = doc.add_paragraph(style="Caption")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next = False
            p.paragraph_format.space_after = Pt(8)
            font(p.add_run(caption), 9.5)
            images += 1
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:], 2)
        elif line.startswith("## "):
            doc.add_heading(line[3:], 1)
        else:
            p = doc.add_paragraph()
            font(p.add_run(line))
    target = output / (name + version + "_软件使用说明书.docx")
    doc.save(target)
    return {"file": str(target), "images": images, "chapters": 16}


def source_listing(listing, output):
    meta = listing["manifest"]
    name, version = meta["softwareName"], meta["version"]
    doc = base_document(name, version, source=True)
    header(doc.sections[0], name, version)
    for page in listing["pages"]:
        if len(page["records"]) != 50:
            raise ValueError("A source page must have exactly 50 display lines")
        for i, record in enumerate(page["records"]):
            p = doc.add_paragraph()
            fmt = p.paragraph_format
            fmt.first_line_indent = Pt(0)
            fmt.left_indent = Pt(0)
            fmt.right_indent = Pt(0)
            fmt.space_before = fmt.space_after = Pt(0)
            fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            fmt.line_spacing = Pt(14.5)
            fmt.keep_with_next = False
            fmt.keep_together = False
            fmt.widow_control = False
            if page["page"] > 1 and i == 0:
                fmt.page_break_before = True
            r = font(p.add_run(record["text"]), 8.5, "Consolas")
            r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    target = output / (name + version + "_源程序鉴别材料.docx")
    doc.save(target)
    (output / "source-manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf8")
    return {"file": str(target), "plannedPages": 60, "displayLinesPerPage": 50, "sourceCommit": meta["sourceCommit"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listing", type=Path, default=ROOT / "test-output/copyright-docs/source-listing.json")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/software-docs")
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    parser.add_argument("--only", choices=["manual", "source", "both"], default="both")
    args = parser.parse_args()
    listing = json.loads(args.listing.read_text(encoding="utf8"))
    args.output.mkdir(parents=True, exist_ok=True)
    name, version = listing["manifest"]["softwareName"], listing["manifest"]["version"]
    result = json.loads((args.output / "build-report.json").read_text(encoding="utf8")) if (args.output / "build-report.json").exists() else {}
    if args.only != "source":
        result["manual"] = manual(name, version, args.output, args.date)
    if args.only != "manual":
        result["source"] = source_listing(listing, args.output)
    (args.output / "build-report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
