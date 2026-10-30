"""Inspect Word packages and actual PDF text bounds after native rendering."""
import argparse
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
import pdfplumber
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def inspect_package(path):
    with zipfile.ZipFile(path) as z:
        core = ET.fromstring(z.read("docProps/core.xml"))
        for node in core:
            if node.tag.endswith("}creator") or node.tag.endswith("}lastModifiedBy"):
                if node.text != "叙帧项目文档":
                    raise ValueError("Sanitize Office author metadata before publication")
        root = ET.fromstring(z.read("word/document.xml"))
        text = "\n".join(n.text or "" for n in root.findall(".//w:t", NS))
        for pattern in [r"\bsk-[A-Za-z0-9_-]{24,}\b", r"github_pat_[A-Za-z0-9_]{30,}"]:
            if re.search(pattern, text):
                raise ValueError("Possible credential in output")
        return {"bodyParagraphs": len(root.findall(".//w:body/w:p", NS)), "sections": len(root.findall(".//w:sectPr", NS)), "images": len([n for n in z.namelist() if n.startswith("word/media/")]), "characters": len(text)}


def inspect_bbox(path, source=False):
    results = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            width, height = page.width, page.height
            lines = page.extract_text_lines(x_tolerance=1.5, y_tolerance=2)
            body = [n for n in lines if n["top"] >= (26 if source else 60) and n["bottom"] <= height - 24]
            outside = [n for n in lines if n["x0"] < 15 or n["x1"] > width - 15 or n["top"] < 5 or n["bottom"] > height - 5]
            if outside:
                raise ValueError("Text outside safe page area on page " + str(i + 1))
            results.append({"page": i + 1, "lines": len(lines), "bodyLines": len(body), "images": len(page.images), "widthPt": width, "heightPt": height})
            if not source and i >= 3 and not page.images and len(body) < 30:
                raise ValueError("Manual body page without an image has fewer than 30 lines: " + str(i + 1))
    if source and (len(results) != 60 or any(p["bodyLines"] != 50 for p in results)):
        raise ValueError("Source requires 60 pages with 50 rendered body lines each: " + json.dumps([p for p in results if p["bodyLines"] != 50][:8]))
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/software-docs")
    parser.add_argument("--qa", type=Path, default=ROOT / "test-output/copyright-docs")
    args = parser.parse_args()
    listing = json.loads((args.qa / "source-listing.json").read_text(encoding="utf8"))
    assert len(listing["pages"]) == 60
    assert all(len(p["records"]) == 50 for p in listing["pages"])
    for item in listing["manifest"]["files"]:
        source = (ROOT / item["file"]).resolve()
        assert source.is_relative_to(ROOT)
        assert hashlib.sha256(source.read_bytes()).hexdigest() == item["sha256"], item["file"]
    source_doc = next(args.output.glob("*_源程序鉴别材料.docx"))
    with zipfile.ZipFile(source_doc) as package:
        source_xml = ET.fromstring(package.read("word/document.xml"))
        actual = ["".join(n.text or "" for n in p.findall(".//w:t", NS)) for p in source_xml.findall(".//w:body/w:p", NS)]
        expected = [r["text"] for p in listing["pages"] for r in p["records"]]
        assert actual == expected, "Word source text must equal the selected repository listing"
    report = {}
    for kind, suffix in [("manual", "_软件使用说明书.docx"), ("source", "_源程序鉴别材料.docx")]:
        path = next(args.output.glob("*" + suffix))
        pages = inspect_bbox(args.qa / (kind + ".pdf"), kind == "source")
        report[kind] = {**inspect_package(path), "pages": len(pages), "pageDetails": pages}
    (args.qa / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({k: {"pages": v["pages"], "images": v["images"], "paragraphs": v["bodyParagraphs"]} for k, v in report.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
