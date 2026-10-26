"""Regression checks for the elevator report pipeline.

Run it directly - no test framework needed:

    .venv/Scripts/python.exe tests/test_report_generation.py

It drives the real API with Flask's test client and then opens the generated
.docx to confirm what actually landed on the page: the approved SGS layout, one
report per lift, single-word answers, upright photographs sized to the
template's own frames, and the QR code in its own row.
"""
import io
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from docx import Document  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Emu  # noqa: E402
from PIL import Image  # noqa: E402

from app import create_app  # noqa: E402

GENERATED = os.path.join(BACKEND, "generated")

failures = []


def check(label, ok, extra=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label} {extra}")
    if not ok:
        failures.append(label)


def make_images(folder):
    """Three visually distinct images so each can be traced in the output."""
    spec = {
        "PORTRAIT": ((255, 0, 0), (600, 900)),
        "LANDSCAPE": ((0, 128, 255), (1200, 600)),
        "QR": ((0, 0, 0), (300, 300)),
    }
    marks, paths = {}, {}
    for name, (colour, size) in spec.items():
        path = os.path.join(folder, f"_test_{name}.png")
        Image.new("RGB", size, colour).save(path)
        # Traced by colour, not bytes: photos may be cropped and re-encoded.
        marks[colour] = name
        paths[name] = path
    return marks, paths


def main():
    app = create_app("development")
    client = app.test_client()
    marks, images = make_images(GENERATED)

    token = client.post(
        "/api/auth/login", json={"employee_id": "admin", "password": "123"}
    ).json["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    # ---------------------------------------------------------------- set-up
    schema = client.get("/api/modules/elevator_inspection/form-schema", headers=auth).json
    module = schema["module"]
    check("check-list enforcement is off for testing", schema["enforce_required"] is False)
    check("photo slots are optional", all(not s["required"] for s in module["photo_slots"]))
    check("QR is an upload, not a text box", "qr_code" not in [f["key"] for f in module["title_page"]])

    # Creating a client per run would litter the approved list (names are
    # unique, and new clients need an admin's SBU). Use a retired placeholder
    # client so the test jobs never land on a real company.
    directory = client.get("/api/clients/directory", headers=auth).json["clients"]
    customer = next((c for c in directory if not c["is_active"]), directory[0])
    job = client.post(
        "/api/jobs",
        headers=auth,
        json={"client_id": customer["id"], "site_name": "Naya Nazimabad", "inspection_date": "2026-03-27"},
    ).json["job"]

    record = client.post(
        "/api/inspection-sets",
        headers=auth,
        json={
            "module_slug": "elevator_inspection",
            "job_id": job["id"],
            "unit_count": 2,
            "title_page": {
                "client": {"value": "IITC"},
                "sgs_ref_no": {"value": "5034500"},
                "inspected_by": {"value": "Sumair Ahmed"},
                "site": {"value": "Naya Nazimabad, Karachi"},
            },
        },
    ).json["set"]
    set_id = record["id"]
    lifts = record["reports"]
    check("one report per lift", len(lifts) == 2)

    for slot, name in (("cover_photo", "PORTRAIT"), ("site_photo", "LANDSCAPE"), ("qr_code", "QR")):
        with open(images[name], "rb") as handle:
            client.post(
                f"/api/inspection-sets/{set_id}/photos",
                headers=auth,
                data={"slot_key": slot, "files": (handle, f"{slot}.png")},
                content_type="multipart/form-data",
            )

    # --------------------------------------------------- fill and submit both
    for index, lift in enumerate(lifts, start=1):
        client.patch(
            f"/api/reports/{lift['id']}",
            headers=auth,
            json={
                "data": {
                    "identification": {"value": f"LIFT-0{index}"},
                    "make": {"value": "Otis"},
                    "status": {"value": "satisfactory"},
                    "alarm_operation": {"value": "satisfactory"},
                    "conclusion": {"value": "satisfactory"},
                }
            },
        )
        result = client.post(f"/api/reports/{lift['id']}/submit", headers=auth)
        if index == 1:
            check("submits with the check-list barely filled", result.status_code == 200)
            following = client.get(f"/api/reports/{lifts[1]['id']}", headers=auth).json["report"]
            check(
                "shared particulars carry to the next lift",
                following["prefill"].get("make", {}).get("value") == "Otis",
                str(list(following["prefill"])),
            )
            check(
                "the lift's own identity does not carry over",
                "identification" not in following["prefill"],
            )
        else:
            check(
                "the last submit sends the combined report to review",
                "gone to the reviewer" in result.json["message"],
                result.json["message"],
            )

    record = client.get(f"/api/inspection-sets/{set_id}", headers=auth).json["set"]
    check("set has a generated document", bool(record["docx_path"]), str(record["docx_path"]))

    # The reviewer's preview: the whole visit as one PDF, if a converter exists.
    from services.pdf_converter import engine

    with app.app_context():
        converter = engine()
    if converter:
        pdf = client.get(f"/api/inspection-sets/{set_id}/pdf", headers=auth)
        check("the visit has a PDF preview", pdf.status_code == 200 and pdf.data[:4] == b"%PDF",
              f"{pdf.status_code} via {converter[0]}")
        check("the PDF stays small", len(pdf.data) < 5 * 1024 * 1024, f"{len(pdf.data) // 1024} KB")
    else:
        print("SKIP  no PDF converter installed - preview not tested")
    queue = client.get("/api/reports/review-queue", headers=auth).json["items"]
    check("the visit waits in the review queue as one item",
          sum(1 for i in queue if i["kind"] == "set" and i["id"] == set_id) == 1
          and not any(i["kind"] == "report" and i["id"] in [l["id"] for l in lifts] for i in queue))

    # ------------------------------------------------------- read it back
    document = Document(os.path.join(GENERATED, record["docx_path"]))
    text = "\n".join(p.text for p in document.paragraphs)
    cells = " ".join(c.text for t in document.tables for r in t.rows for c in r.cells)
    both = f"{text} {cells}"

    print("\n--- approved SGS layout ---")
    check("SGS letterhead kept", "Korangi Industrial Area" in both)
    check("cover title kept", "Third Party Inspection" in both)
    check("title page appears once", text.count("INSPECTION FINDINGS") == 2)
    check("one Examination Report per lift", text.count("Examination Report") == 2)
    check("both lifts identified", "LIFT-01" in both and "LIFT-02" in both)
    check("placeholders substituted", "(Equipment I.D)" not in both and "(Client Name)" not in both)
    check("original check-point wording kept",
          "Check the condition and operation of fire safety switch." in both)

    print("\n--- answers ---")
    checklist = " ".join(
        c.text
        for t in document.tables
        if t.rows and " ".join(t.rows[0].cells[-1].text.split()).lower().startswith("remarks")
        for r in t.rows[1:]
        for c in r.cells
    )
    check("check-point cells hold a single word", "Satisfactory" in checklist)
    check("no long clause in a check-point cell",
          "Found satisfactory at the time of inspection" not in checklist)
    # The conclusion is a "Conclusion: <statement>" line under the findings.
    conclusions = [
        p.text for p in document.paragraphs
        if p.text.strip().lower().startswith("conclusion:")
    ]
    check("the Conclusion keeps its full clause",
          conclusions and "fit for intended use" in conclusions[0].lower())
    check("only the chosen conclusion is printed",
          not any("found unsatisfactory" in p.text.lower() for p in document.paragraphs))

    print("\n--- photographs ---")

    def identify(rid):
        picture = Image.open(io.BytesIO(document.part.related_parts[rid].blob)).convert("RGB")
        centre = picture.getpixel((picture.width // 2, picture.height // 2))
        for colour, name in marks.items():
            if all(abs(a - b) <= 12 for a, b in zip(centre, colour)):
                return name
        return "TEMPLATE"

    found = []
    for shape in document.inline_shapes:
        pic = shape._inline.graphic.graphicData.pic
        xfrm = pic.find(".//" + qn("a:xfrm"))
        node, container = shape._inline, "paragraph"
        while node is not None:
            if node.tag == qn("w:tbl"):
                container = "table"
                break
            node = node.getparent()
        found.append(
            (
                identify(pic.blipFill.blip.embed),
                round(Emu(int(shape.width)).mm, 1),
                round(Emu(int(shape.height)).mm, 1),
                xfrm.get("rot") if xfrm is not None else None,
                container,
            )
        )
    print("   ", found)

    check("nothing is left rotated", all(f[3] is None for f in found))
    check("no template sample photo survives", "TEMPLATE" not in [f[0] for f in found])
    check("every picture sits in its table", all(f[4] == "table" for f in found))
    check("portrait fits its 66 x 47.8 mm frame",
          any(n == "PORTRAIT" and w <= 66 and h <= 47.8 for n, w, h, _, _ in found))
    check("landscape fits its 66 x 51.1 mm frame",
          any(n == "LANDSCAPE" and w <= 66 and h <= 51.1 for n, w, h, _, _ in found))
    cover = [(w, h) for n, w, h, _, _ in found if n in ("PORTRAIT", "LANDSCAPE")]
    check("the two cover photos are the same size", len(cover) == 2 and cover[0] == cover[1],
          str(cover))
    check("QR sits in the QR Code row",
          any(
              len(r.cells[2]._element.findall(".//" + qn("a:blip"))) == 1
              for t in document.tables
              for r in t.rows
              if len(r.cells) >= 3 and r.cells[0].text.strip().lower().startswith("qr")
          ))

    picture_tables = [
        t for t in document.tables
        if len(t.rows) == 1 and len(t.columns) == 2 and t._element.findall(".//" + qn("a:blip"))
    ]
    check("the cover picture table is intact, one photo per cell",
          bool(picture_tables)
          and all(len(c._element.findall(".//" + qn("a:blip"))) == 1
                  for c in picture_tables[0].rows[0].cells))

    for path in images.values():
        try:
            os.remove(path)
        except OSError:
            pass

    print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILURES: {failures}"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
