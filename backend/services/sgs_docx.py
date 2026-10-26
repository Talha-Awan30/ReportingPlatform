"""Fill the approved SGS Word document in place.

Rather than rebuilding the report layout in code, this opens the client's own
`Elevator Report Format.docx` and writes the inspector's values into the cells
and paragraphs that are already there. The output is therefore the approved
format - the same fonts, borders, headers, footers and SGS letterhead - with
the blanks filled in.

The template holds BOTH halves of the document, separated by a Word section
break:

    [ title page ]  t0 header · t1 client details · t2 prepared/reviewed
    -- section break --
    [ report body ] signature · particulars · 9 check-lists · load test ·
                    conclusion · photographic presentation

`split_template()` cuts it at that break, so one visit produces:

    title page (once)  +  report body (repeated per lift)

Tables are located by their own header text, not by position, so the template
can be re-ordered or extended without breaking the mapping.
"""
import logging
import os

from docx.oxml.ns import qn

log = logging.getLogger(__name__)

# Text that identifies where the report body begins.
BODY_MARKER = "examination report"
TITLE_MARKER = "third party inspection"


# ---------------------------------------------------------------- primitives
def set_text(paragraph, text):
    """Replace a paragraph's text, keeping the first run's formatting."""
    text = "" if text is None else str(text)
    if paragraph.runs:
        paragraph.runs[0].text = text
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.add_run(text)


def set_cell(cell, text, like=None):
    """Write into a table cell, keeping its existing paragraph formatting.

    The answer cells in the approved document are empty, so there is no run to
    inherit from. Pass `like` - normally the check-point cell in the same row -
    and the new text picks up that cell's font, size and colour, so the answer
    sits in the box looking exactly like the text beside it.
    """
    text = "" if text is None else str(text)
    if not cell.paragraphs:
        cell.add_paragraph(text)
        return

    had_runs = bool(cell.paragraphs[0].runs)
    set_text(cell.paragraphs[0], text)

    for extra in cell.paragraphs[1:]:
        extra._element.getparent().remove(extra._element)

    if not had_runs and like is not None:
        _copy_run_format(like, cell.paragraphs[0])


def set_cell_font(cell, name, size_pt, bold=False):
    """Give every run in a cell one font, size and weight."""
    from docx.shared import Pt

    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            run.font.name = name
            # font.name covers Latin text only; set the other scripts too.
            fonts = run._r.get_or_add_rPr().get_or_add_rFonts()
            for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
                fonts.set(qn(attr), name)
            run.font.size = Pt(size_pt)
            run.bold = bold


def _copy_run_format(source_cell, target_paragraph):
    """Copy font name/size/colour from a source cell's first run."""
    source_run = next(
        (r for p in source_cell.paragraphs for r in p.runs if r.text.strip()), None
    )
    if source_run is None or not target_paragraph.runs:
        return

    target = target_paragraph.runs[0]
    try:
        if source_run.font.name:
            target.font.name = source_run.font.name
        if source_run.font.size:
            target.font.size = source_run.font.size
        if source_run.font.color and source_run.font.color.rgb:
            target.font.color.rgb = source_run.font.color.rgb
        # Answers are plain text - never inherit a heading's bold/italic.
        target.bold = False
        target.italic = False
    except Exception:  # noqa: BLE001 - formatting is best-effort
        log.debug("Could not copy run formatting", exc_info=True)


def replace_in_paragraph(paragraph, mapping):
    """Substitute placeholder fragments while keeping the run's formatting."""
    full = "".join(run.text for run in paragraph.runs)
    if not full:
        return
    replaced = full
    for needle, value in mapping.items():
        if needle in replaced:
            replaced = replaced.replace(needle, "" if value is None else str(value))
    if replaced != full:
        set_text(paragraph, replaced)


def _image_stream(path, aspect=None):
    """Any uploaded picture as a compressed JPEG/PNG stream Word can embed.

    With `aspect` (width / height) it is centre-cropped to exactly that shape.
    """
    from services.image_compress import compressed_stream

    return compressed_stream(path, aspect=aspect)


def add_image_to_cell(cell, path, width_mm=75):
    """Append a picture underneath whatever label the cell already carries."""
    from docx.shared import Mm

    if not path or not os.path.exists(path):
        return False
    paragraph = cell.add_paragraph()
    paragraph.add_run().add_picture(_image_stream(path), width=Mm(width_mm))
    return True


# Space the label line under each photo needs, and breathing room around it.
PHOTO_LABEL_TWIPS = 330
PHOTO_PAD_TWIPS = 120


def photo_grid_box(table):
    """One picture size (EMU) that fits every cell of the photo grid.

    Taken from the template's own column widths and row heights, so every
    photograph prints at the same size whatever shape it was uploaded in.
    """
    tbl_pr = table._tbl.tblPr
    margins = 101 + 49
    if tbl_pr is not None:
        mar = tbl_pr.find(qn("w:tblCellMar"))
        if mar is not None:
            margins = sum(
                int(side.get(qn("w:w"), 0))
                for side in mar
                if side.tag in (qn("w:left"), qn("w:right"), qn("w:start"), qn("w:end"))
            )

    widths = [int(c.get(qn("w:w"))) for c in table._tbl.tblGrid.findall(qn("w:gridCol"))]
    heights = []
    for row in table.rows:
        tr_h = row._tr.find("./" + qn("w:trPr") + "/" + qn("w:trHeight"))
        if tr_h is not None and tr_h.get(qn("w:val")):
            heights.append(int(tr_h.get(qn("w:val"))))

    width = min(widths or [4500]) - margins - PHOTO_PAD_TWIPS
    height = min(heights or [3400]) - PHOTO_LABEL_TWIPS - PHOTO_PAD_TWIPS
    return width * 635, height * 635


def lock_photo_rows(table):
    """Fix the grid's row heights so no picture can grow its row."""
    for row in table.rows:
        tr_h = row._tr.find("./" + qn("w:trPr") + "/" + qn("w:trHeight"))
        if tr_h is not None:
            tr_h.set(qn("w:hRule"), "exact")


def place_grid_photo(cell, path, box):
    """Put a photo above the cell's label, cropped to exactly `box`."""
    import copy

    from docx.text.paragraph import Paragraph

    if not path or not os.path.exists(path):
        return False
    width, height = box
    try:
        stream = _image_stream(path, aspect=width / height)
    except Exception:  # noqa: BLE001 - a bad image must not lose the report
        log.exception("Could not read photograph %s", path)
        return False

    label = cell.paragraphs[0]
    new_p = copy.deepcopy(label._p)
    for child in list(new_p):
        if child.tag != qn("w:pPr"):
            new_p.remove(child)
    label._p.addprevious(new_p)

    paragraph = Paragraph(new_p, cell)
    fmt = paragraph.paragraph_format
    fmt.space_before = fmt.space_after = 0
    fmt.line_spacing = 1.0
    fmt.right_indent = 0
    paragraph.add_run().add_picture(stream, width=width, height=height)
    return True


# Headings that must always open a fresh page.
NEW_PAGE_HEADINGS = {"INSPECTION FINDINGS", "PHOTOGRAPHIC PRESENTATION"}


def start_on_new_page(paragraph):
    """Begin this paragraph at the top of a new page.

    Blank lines just above it are removed: on a nearly full page they would
    spill onto a page of their own and print as an empty extra page.
    """
    paragraph.paragraph_format.page_break_before = True
    node = paragraph._p.getprevious()
    while node is not None and node.tag == qn("w:p") and _is_blank(node):
        previous = node.getprevious()
        node.getparent().remove(node)
        node = previous


def set_labelled(paragraph, value):
    """Fill a "Label: value" line - the label keeps its bold, the value is plain.

    Whatever followed the colon in the template (a placeholder such as XXX,
    or sample wording) is replaced.
    """
    import copy

    from docx.text.run import Run

    label_run = None
    for run in list(paragraph.runs):
        if label_run is not None:
            run._r.getparent().remove(run._r)
        elif ":" in run.text:
            run.text = run.text[: run.text.index(":") + 1]
            label_run = run
    if label_run is None:
        return False

    value = "" if value is None else str(value).strip()
    if value:
        new_r = copy.deepcopy(label_run._r)
        label_run._r.addnext(new_r)
        new_run = Run(new_r, paragraph)
        new_run.text = " " + value
        new_run.bold = False
    return True


def _drop_following_lines(paragraph):
    """Remove the non-blank paragraphs directly after this one."""
    node = paragraph._p.getnext()
    while node is not None and node.tag == qn("w:p") and not _is_blank(node):
        following = node.getnext()
        node.getparent().remove(node)
        node = following


# ------------------------------------------------------------- table finding
def _cell_text(cell):
    return " ".join(cell.text.split()).strip()


def _row_texts(table, row=0):
    if not table.rows:
        return []
    return [_cell_text(c) for c in table.rows[row].cells]


def find_tables(doc):
    """Locate every block of the report body by its own header text.

    Returns a dict of the tables the filler needs. Anything it cannot find is
    simply absent, and that part of the report is skipped.
    """
    found = {"checklists": []}

    for table in doc.tables:
        header = _row_texts(table)
        first = header[0] if header else ""
        lowered = first.lower()

        if len(header) == 2 and header[1].lower().startswith("remarks"):
            found["checklists"].append(table)
        elif len(header) == 2 and lowered == "description" and header[1].lower() == "result":
            found["load_test"] = table
        elif len(header) == 2 and lowered == "particulars":
            found["signature"] = table
        elif len(header) in (2, 3) and lowered.startswith("name of client"):
            # label | value, or label | : | value in older templates.
            found["particulars"] = table
        elif len(header) == 2 and lowered == "cabin":
            found["photos"] = table
        elif len(header) == 3 and lowered.startswith("next examination"):
            found["conclusion"] = table
        elif any(
            _cell_text(c).lower().startswith("next examination")
            for r in table.rows
            for c in r.cells
        ) and len(header) == 3:
            found["conclusion"] = table

    return found


# ------------------------------------------------------- splitting the parts
def _split_index(doc):
    """Index of the first body child that belongs to the report body.

    The cut is the paragraph carrying the section break that ends the title
    page. Falls back to the "Examination Report" heading if there is no break.
    """
    from docx.text.paragraph import Paragraph

    body = doc.element.body
    children = list(body)

    marker_index = None
    for index, child in enumerate(children):
        if child.tag != qn("w:p"):
            continue
        if Paragraph(child, doc).text.strip().lower().startswith(BODY_MARKER):
            marker_index = index
            break

    if marker_index is None:
        return None

    # The last section break before the heading ends the title page.
    for index in range(marker_index - 1, -1, -1):
        child = children[index]
        if child.tag == qn("w:p") and child.find(".//" + qn("w:sectPr")) is not None:
            return index + 1

    return marker_index


def has_embedded_title_page(path):
    """True when this template carries its own cover page."""
    from docx import Document

    try:
        doc = Document(path)
    except Exception:
        log.exception("Could not open template %s", path)
        return False

    if _split_index(doc) is None:
        return False
    return any(TITLE_MARKER in _cell_text(c).lower() for t in doc.tables for r in t.rows for c in r.cells)


def _drop(children):
    for child in children:
        parent = child.getparent()
        if parent is not None:
            parent.remove(child)


def load_title_part(path):
    """The template with the report body removed - the cover page alone."""
    from docx import Document

    doc = Document(path)
    split = _split_index(doc)
    if split is None:
        return doc

    body = doc.element.body
    children = list(body)

    # Everything from the split to the body's own sectPr belongs to the report.
    tail = [c for c in children[split:] if c.tag != qn("w:sectPr")]
    _drop(tail)

    # The title page's section properties live on its last paragraph. Promote
    # them to the body so the cover keeps its own page setup, headers and
    # footers, and no empty trailing section is left behind.
    remaining = list(body)
    for child in reversed(remaining):
        if child.tag != qn("w:p"):
            continue
        sect = child.find(".//" + qn("w:sectPr"))
        if sect is None:
            continue
        body_sect = body.find(qn("w:sectPr"))
        if body_sect is not None:
            body.remove(body_sect)
        sect.getparent().remove(sect)
        body.append(sect)
        break

    return doc


def load_unit_part(path):
    """The template with the cover page removed - one lift's report body."""
    from docx import Document

    doc = Document(path)
    split = _split_index(doc)
    if split is None:
        return doc

    _drop(list(doc.element.body)[:split])
    return doc


# --------------------------------------------------------------- title page
TITLE_FIELDS = {
    "client": "client",
    "client ref": "client_ref",
    "client contact person": "client_contact_person",
    "sgs ref. no.": "sgs_ref_no",
    "sgs ref no.": "sgs_ref_no",
    "sgs ref no": "sgs_ref_no",
    "inspected by": "inspected_by",
    "site": "site",
    "equipment identification": "equipment_identification",
    "survey date": "survey_date",
    "qr code": "qr_code",
}


def fill_title_page(doc_or_path, values, photos=None, spec=None):
    """Write the visit's details onto the approved cover page."""
    from docx.enum.table import WD_ALIGN_VERTICAL

    doc = _as_doc(doc_or_path)

    # The template's own picture frames, captured NOW. A picture written into a
    # table cell later (the QR code) would otherwise join `inline_shapes` and,
    # because that table sits above the frames, shift every later match by one.
    frames = list(doc.inline_shapes)

    # A photo slot may claim a row of the details table (the QR Code), in
    # which case that row takes an image instead of text.
    slot_by_label = {
        slot.cell_label.strip().lower(): slot
        for slot in (spec.title_page_photos if spec else [])
        if slot.cell_label
    }
    photo_by_slot = {p.get("slot"): p for p in (photos or []) if p.get("slot")}

    # The cover heading, carried in the first table's left cell.
    if values.get("report_title"):
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if TITLE_MARKER in _cell_text(cell).lower():
                        set_cell(cell, values["report_title"])

    # The details table: label | : | value.
    for table in doc.tables:
        for row in table.rows:
            if len(row.cells) < 3:
                continue
            label = _cell_text(row.cells[0]).lower().rstrip(":")

            if label in slot_by_label:
                # This row holds a picture, not text.
                photo = photo_by_slot.get(slot_by_label[label].key)
                if photo and photo.get("path") and os.path.exists(photo["path"]):
                    _set_cell_image(row.cells[2], photo["path"])
                continue

            key = TITLE_FIELDS.get(label)
            if key:
                set_cell(row.cells[2], values.get(key, ""), like=row.cells[0])

    # Prepared by / Reviewed by.
    for table in doc.tables:
        for index, row in enumerate(table.rows):
            if len(row.cells) != 2:
                continue
            if "prepared by" in _cell_text(row.cells[0]).lower() and index + 1 < len(table.rows):
                target = table.rows[index + 1].cells
                set_cell(target[0], _join(values.get("prepared_by_name"),
                                          values.get("prepared_by_designation")))
                set_cell(target[1], _join(values.get("reviewed_by_name"),
                                          values.get("reviewed_by_designation")))
                # The empty template cells carry no font of their own, so both
                # names are set explicitly to match the rest of the cover.
                for cell in target[:2]:
                    set_cell_font(cell, "Arial", 10)
                    # The template aligns the two cells differently; match them.
                    cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP

    frame_slots = [s for s in (spec.title_page_photos if spec else []) if not s.cell_label]
    apply_cover_photos(doc, frames, frame_slots, photo_by_slot, photos)
    _move_frames_below_header(doc)
    return doc


def _move_frames_below_header(doc):
    """Put the cover photographs in the gap under the report header.

    The template leaves them below the client details table, which prints them
    low on the page with a blank band above. Moving the paragraph that carries
    them directly after the header table fills that space instead.
    """
    body = doc.element.body

    # A template that puts its pictures in a table has already placed them.
    if any(
        child.tag == qn("w:tbl") and child.find(".//" + qn("a:blip")) is not None
        for child in body
    ):
        return False

    header = next(
        (
            child
            for child in body
            if child.tag == qn("w:tbl")
            and TITLE_MARKER in " ".join(child.itertext()).lower()
        ),
        None,
    )
    frame_para = next(
        (
            child
            for child in body
            if child.tag == qn("w:p") and child.find(".//" + qn("a:blip")) is not None
        ),
        None,
    )

    if header is None or frame_para is None:
        return False

    # lxml moves the element rather than copying it.
    header.addnext(frame_para)

    # The template left blank paragraphs where the pictures used to be. With
    # the frames moved up they would print as a band of white, so drop the
    # empty ones between the photographs and the next table.
    node = frame_para.getnext()
    while node is not None and node.tag == qn("w:p"):
        following = node.getnext()
        empty = (
            not "".join(node.itertext()).strip()
            and node.find(".//" + qn("a:blip")) is None
            and node.find(".//" + qn("w:sectPr")) is None
        )
        if not empty:
            break
        node.getparent().remove(node)
        node = following

    return True


def apply_cover_photos(doc, frames, frame_slots, photo_by_slot, all_photos=None):
    """Fill the cover's picture frames, and clear the ones left unused.

    Each frame belongs to one manifest slot, in declared order, so the
    "Cover photograph" upload always lands in the first frame. A frame whose
    slot was not filled in is removed outright, so the template's sample
    photograph never survives into a real report.
    """
    if frame_slots:
        pairs = [(frame, photo_by_slot.get(slot.key)) for frame, slot in zip(frames, frame_slots)]
    else:
        # No manifest to go on: fall back to filling the frames in order.
        usable = [p for p in (all_photos or []) if p.get("path") and os.path.exists(p["path"])]
        pairs = list(zip(frames, usable + [None] * len(frames)))

    # Frames side by side in one table row print as a matched pair: one box
    # for both (the smaller of the template's two), each photo cropped to fill
    # it, centred in its cell - so they line up whatever was uploaded.
    rows = {}
    for frame, _ in pairs:
        row = _ancestor(frame._inline, "w:tr")
        if row is not None:
            rows.setdefault(row, []).append(frame)
    shared = {}
    for frames_in_row in rows.values():
        if len(frames_in_row) > 1:
            boxes = [_frame_box(f) for f in frames_in_row]
            box = (min(b[0] for b in boxes), min(b[1] for b in boxes))
            for frame in frames_in_row:
                shared[id(frame)] = box

    for frame, photo in pairs:
        if photo and photo.get("path") and os.path.exists(photo["path"]):
            if id(frame) in shared:
                _swap_frame_image(doc, frame, photo["path"], box=shared[id(frame)], fill=True)
                _centre_in_cell(frame)
            else:
                # Capture the template's own extent first - it is the size the
                # designer laid out for this picture, and it is what the
                # uploaded photo has to fit into.
                _swap_frame_image(doc, frame, photo["path"], box=_frame_box(frame))
        else:
            _remove_frame(frame)


def _ancestor(node, tag):
    while node is not None and node.tag != qn(tag):
        node = node.getparent()
    return node


def _centre_in_cell(shape):
    """Centre a picture both ways in its cell, with no stray paragraph space."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph

    tc = _ancestor(shape._inline, "w:tc")
    p = _ancestor(shape._inline, "w:p")
    if tc is None or p is None:
        return
    tc_pr = tc.get_or_add_tcPr()
    v_align = tc_pr.find(qn("w:vAlign"))
    if v_align is None:
        v_align = OxmlElement("w:vAlign")
        tc_pr.append(v_align)
    v_align.set(qn("w:val"), "center")

    fmt = Paragraph(p, None).paragraph_format
    fmt.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fmt.space_before = fmt.space_after = 0
    fmt.left_indent = fmt.right_indent = fmt.first_line_indent = 0


def _frame_box(shape):
    """The box the template drew for this picture, in EMU.

    A frame sitting in a table cell is also held to that cell's width, so a
    later template edit cannot push a photograph outside its column.
    """
    from docx.shared import Mm

    width, height = int(shape.width), int(shape.height)

    node = shape._inline
    while node is not None and node.tag != qn("w:tc"):
        node = node.getparent()
    if node is not None:
        tc_w = node.find("./" + qn("w:tcPr") + "/" + qn("w:tcW"))
        if tc_w is not None and tc_w.get(qn("w:type")) == "dxa":
            try:
                # dxa is twentieths of a point; leave a little room inside.
                cell_width = int(tc_w.get(qn("w:w"))) * 635
                width = min(width, cell_width - Mm(3))
            except (TypeError, ValueError):
                pass

    return width, height


def _set_cell_image(cell, path, width_mm=18):
    """Replace a cell's contents with a single picture, e.g. the QR code."""
    from docx.shared import Mm

    for extra in cell.paragraphs[1:]:
        extra._element.getparent().remove(extra._element)
    paragraph = cell.paragraphs[0] if cell.paragraphs else cell.add_paragraph()
    for run in list(paragraph.runs):
        run._element.getparent().remove(run._element)
    paragraph.add_run().add_picture(_image_stream(path), width=Mm(width_mm))


# The cover photographs are sized to fit inside this box, keeping their own
# proportions. Two of them then sit comfortably side by side on the page.
COVER_MAX_W_MM = 55
COVER_MAX_H_MM = 42


def _swap_frame_image(doc, shape, path, box=None, fill=False):
    """Point one picture frame at a new image, upright and sized to fit `box`.

    With `fill`, the photo is cropped to the box's shape and fills it exactly.
    """
    from docx.shared import Mm

    try:
        aspect = (box[0] / box[1]) if fill and box and box[1] else None
        # A fresh image part carries the correct content type and extension,
        # which swapping the raw bytes of the template's part would not.
        rid, image = doc.part.get_or_add_image(_image_stream(path, aspect=aspect))
        pic = shape._inline.graphic.graphicData.pic
        pic.blipFill.blip.embed = rid

        # The template's frames are rotated 90 degrees to suit the sample
        # photographs. An uploaded picture is already the right way up, so the
        # rotation and any flip have to go or it prints on its side.
        _clear_rotation(pic)

        # Fit inside the frame the template drew, keeping the photo's own
        # proportions, so it fills its place without being stretched.
        max_w, max_h = box or (Mm(COVER_MAX_W_MM), Mm(COVER_MAX_H_MM))
        ratio = (image.height / image.width) if image.width else 1

        width = max_w
        height = int(width * ratio)
        if height > max_h:
            height = max_h
            width = int(height / ratio) if ratio else max_w

        shape.width = int(width)
        shape.height = int(height)
        return True
    except Exception:  # noqa: BLE001 - a bad image must not lose the report
        log.exception("Could not place cover photograph %s", path)
        return False


def _clear_rotation(pic):
    """Drop any rotation or flip the template applied to a picture frame."""
    for xfrm in pic.iter(qn("a:xfrm")):
        for attribute in ("rot", "flipH", "flipV"):
            if xfrm.get(attribute) is not None:
                del xfrm.attrib[attribute]


def _remove_frame(shape):
    """Delete an unused picture frame so no sample image is left behind."""
    try:
        element = shape._inline
        # Walk up to the run that carries the drawing and drop the whole run.
        node = element
        while node is not None and node.tag != qn("w:r"):
            node = node.getparent()
        target = node if node is not None else element
        parent = target.getparent()
        if parent is not None:
            parent.remove(target)
        return True
    except Exception:  # noqa: BLE001
        log.exception("Could not remove an unused cover frame")
        return False


def _set_cell_image(cell, path, width_mm=18):
    """Replace a cell's contents with a single picture, e.g. the QR code."""
    from docx.shared import Mm

    for extra in cell.paragraphs[1:]:
        extra._element.getparent().remove(extra._element)
    paragraph = cell.paragraphs[0] if cell.paragraphs else cell.add_paragraph()
    for run in list(paragraph.runs):
        run._element.getparent().remove(run._element)
    paragraph.add_run().add_picture(_image_stream(path), width=Mm(width_mm))


def replace_cover_photos(doc, photos):
    """Swap the template's cover photographs for the inspector's own.

    The template already carries the picture frames in the right place at the
    top of the cover page, so the uploaded images replace those in position
    rather than being appended to the end of the document. The frame's width is
    kept and the height recomputed from the new image, so nothing is stretched
    and the side-by-side layout survives.
    """
    usable = [p for p in (photos or []) if p.get("path") and os.path.exists(p["path"])]
    if not usable:
        return 0

    shapes = list(doc.inline_shapes)
    replaced = 0

    for shape, photo in zip(shapes, usable):
        try:
            # A fresh image part carries the correct content type and extension,
            # which swapping the raw bytes of the template's part would not.
            rid, image = doc.part.get_or_add_image(photo["path"])
            shape._inline.graphic.graphicData.pic.blipFill.blip.embed = rid

            # Keep the template's frame width; take the height from the new
            # image so it is placed, not stretched.
            if image.width:
                shape.height = int(shape.width * (image.height / image.width))

            replaced += 1
        except Exception:  # noqa: BLE001 - a bad image must not lose the report
            log.exception("Could not replace cover photograph %s", photo.get("path"))

    if len(usable) > len(shapes):
        log.info(
            "%s cover photo(s) uploaded but the template has only %s frame(s) - extras ignored",
            len(usable),
            len(shapes),
        )
    return replaced


# -------------------------------------------------------------- unit report
def fill_unit_report(doc_or_path, unit, spec, title_page=None):
    """Write one lift's answers onto the approved Examination Report."""
    doc = _as_doc(doc_or_path)
    title_page = title_page or {}
    details = {row["key"]: row for row in unit.get("unit_details") or []}

    def detail(key):
        row = details.get(key) or {}
        return row.get("display") or row.get("value") or ""

    identification = detail("identification") or unit.get("equipment_tag") or ""
    client_name = detail("name_of_client") or unit.get("client_name") or title_page.get("client", "")
    site = title_page.get("site") or unit.get("site_name") or ""
    inspection_date = detail("inspection_date") or unit.get("inspection_date") or ""
    status = detail("status")

    # --- the cover paragraphs of the Examination Report ---------------------
    for paragraph in doc.paragraphs:
        text = paragraph.text
        stripped = text.strip()
        if "(Equipment I.D)" in text:
            replace_in_paragraph(paragraph, {"(Equipment I.D)": identification})
        elif stripped.startswith("Inspection Date:"):
            set_text(paragraph, f"Inspection Date: {inspection_date}")
        elif stripped.startswith("Status:"):
            set_text(paragraph, f"Status: {status}")
        elif stripped.startswith("SGS Order No:"):
            set_text(paragraph, f"SGS Order No: {title_page.get('sgs_ref_no', '')}")
        elif stripped.startswith("Client:"):
            set_text(paragraph, f"Client: {client_name}")
        elif "(Client Name)" in text or "(Site Location)" in text:
            replace_in_paragraph(paragraph, {"(Client Name)": client_name, "(Site Location)": site})
        elif stripped.upper() in NEW_PAGE_HEADINGS:
            start_on_new_page(paragraph)

    tables = find_tables(doc)

    # --- signature block ----------------------------------------------------
    if "signature" in tables:
        for row in tables["signature"].rows:
            if len(row.cells) < 2:
                continue
            label = _cell_text(row.cells[0]).lower().rstrip(":")
            if label == "name":
                set_cell(row.cells[1], title_page.get("inspected_by") or unit.get("inspector_name", ""),
                         like=row.cells[0])
            elif label == "date":
                set_cell(row.cells[1], inspection_date, like=row.cells[0])

    # --- particulars table: label | value (or label | : | value) -----------
    # Rows are matched by their label, so the template can reorder them.
    if "particulars" in tables:
        by_label = {f.label.strip().lower(): f for f in spec.unit_details}
        fallbacks = {
            "name_of_client": client_name,
            "identification": identification,
            "inspection_date": inspection_date,
        }
        for index, row in enumerate(tables["particulars"].rows):
            if len(row.cells) < 2:
                continue
            label = _cell_text(row.cells[0]).lower().rstrip(":").strip()
            field = by_label.get(label)
            if field is None and index < len(spec.unit_details):
                field = spec.unit_details[index]
            if field is None:
                continue
            value = detail(field.key) or fallbacks.get(field.key, "")
            set_cell(row.cells[-1], value, like=row.cells[0])

    # --- check-point tables, one per manifest section ----------------------
    unit_sections = {s["key"]: s for s in unit.get("sections") or []}
    checklist_sections = [s for s in spec.sections if s.key in unit_sections]

    for table, section in zip(tables["checklists"], checklist_sections):
        answers = {row["key"]: row for row in (unit_sections.get(section.key) or {}).get("rows") or []}
        for row, checkpoint in zip(table.rows[1:], section.checkpoints):
            if len(row.cells) < 2:
                continue
            set_cell(row.cells[1], _remark(answers.get(checkpoint.key, {})), like=row.cells[0])

    # --- load test exercise -------------------------------------------------
    load_section = next((s for s in spec.sections if s.key == "load_test"), None)
    if "load_test" in tables and load_section:
        rows = {r["key"]: r for r in (unit_sections.get(load_section.key) or {}).get("rows") or []}
        dropdowns = [cp for cp in load_section.checkpoints if cp.kind == "dropdown"]
        for row, checkpoint in zip(tables["load_test"].rows[1:], dropdowns):
            if len(row.cells) >= 2:
                set_cell(row.cells[1], _remark(rows.get(checkpoint.key, {})), like=row.cells[0])

    # --- next examination + conclusion -------------------------------------
    conclusion = {row["key"]: row for row in unit.get("conclusion") or []}
    if "conclusion" in tables:
        for row in tables["conclusion"].rows:
            if len(row.cells) < 3:
                continue
            label = _cell_text(row.cells[0]).lower()
            if label.startswith("next examination"):
                entry = conclusion.get("next_examination_due", {})
                set_cell(row.cells[2], entry.get("display") or entry.get("value") or "",
                         like=row.cells[0])
            elif label.startswith("conclusion"):
                entry = conclusion.get("conclusion", {})
                set_cell(row.cells[2], entry.get("display") or entry.get("value") or "",
                         like=row.cells[0])

    # --- major / minor findings, written under their headings ---------------
    # The template prints these as "Label: value" lines; the bold label stays
    # and the value follows it in plain text.
    def entry_text(key):
        entry = conclusion.get(key, {})
        return entry.get("display") or entry.get("value") or ""

    for paragraph in list(doc.paragraphs):
        upper = paragraph.text.strip().upper()
        if upper.startswith("MAJOR FINDINGS"):
            set_labelled(paragraph, entry_text("major_findings"))
        elif upper.startswith("MINOR FINDINGS"):
            set_labelled(paragraph, entry_text("minor_findings"))
        elif upper.startswith("NEXT EXAMINATION"):
            set_labelled(paragraph, entry_text("next_examination_due"))
        elif upper.startswith("CONCLUSION") and ":" in paragraph.text:
            # The template offers every closing statement, one per line. Once
            # a conclusion is chosen, print that one and drop the others.
            chosen = entry_text("conclusion")
            if chosen:
                set_labelled(paragraph, chosen)
                _drop_following_lines(paragraph)

    # --- photographic presentation, into the existing grid -----------------
    if "photos" in tables:
        by_slot = {slot["key"]: slot for slot in unit.get("photo_slots") or []}
        slots = list(spec.photo_slots)
        box = photo_grid_box(tables["photos"])
        lock_photo_rows(tables["photos"])
        position = 0
        for row in tables["photos"].rows:
            for cell in row.cells:
                if position >= len(slots):
                    break
                photos = (by_slot.get(slots[position].key) or {}).get("photos") or []
                if photos:
                    place_grid_photo(cell, photos[0]["path"], box)
                position += 1

    return doc


# ------------------------------------------------------------------ compose
def compose(parts, out_path):
    """Merge the filled documents into one file, preserving every style."""
    from docxcompose.composer import Composer

    if not parts:
        raise ValueError("Nothing to compose")

    composer = Composer(parts[0])
    # Where the first appended part begins - the end of the cover page.
    boundary = len(composer.doc.element.body) - 1
    for part in parts[1:]:
        composer.append(part)
    if len(parts) > 1:
        _carry_body_section(composer.doc, parts[1], boundary)
    composer.save(out_path)
    return out_path


def _is_blank(paragraph):
    """An empty paragraph: no text, picture, field or section break."""
    return (
        not "".join(paragraph.itertext()).strip()
        and paragraph.find(".//" + qn("w:drawing")) is None
        and paragraph.find(".//" + qn("w:pict")) is None
        and paragraph.find(".//" + qn("w:sectPr")) is None
    )


def _carry_body_section(doc, source, boundary):
    """Give the report body its own section - and so its own header.

    docxcompose keeps only the first document's section properties and drops
    the header/footer references of everything appended, so without this the
    whole report runs under the cover's (empty) header and the SGS / LEEA
    banner never appears. The cover is closed with its own section break and
    the body takes the report template's page setup, header and footer.
    """
    import copy

    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    from docx.opc.packuri import PackURI
    from docx.oxml import OxmlElement

    body = doc.element.body
    cover_sect = body.find(qn("w:sectPr"))
    source_sect = source.element.body.find(qn("w:sectPr"))
    if cover_sect is None or source_sect is None:
        return

    # 1. Close the cover with a section break carrying its own settings.
    #    The cover's trailing blank paragraphs go first: on a full cover they
    #    spill onto a page of their own and print as an empty extra page.
    children = list(body)
    first_body = children[boundary]
    node = first_body.getprevious()
    while node is not None and node.tag == qn("w:p") and _is_blank(node):
        previous = node.getprevious()
        body.remove(node)
        node = previous

    # The break itself rides on a 1pt paragraph, too small to need a page.
    breaker = OxmlElement("w:p")
    p_pr = breaker.get_or_add_pPr()
    spacing = OxmlElement("w:spacing")
    for attr, value in (("w:before", "0"), ("w:after", "0"), ("w:line", "20"), ("w:lineRule", "exact")):
        spacing.set(qn(attr), value)
    p_pr.append(spacing)
    r_pr = OxmlElement("w:rPr")
    for tag in ("w:sz", "w:szCs"):
        size = OxmlElement(tag)
        size.set(qn("w:val"), "2")
        r_pr.append(size)
    p_pr.append(r_pr)
    p_pr.append(copy.deepcopy(cover_sect))
    first_body.addprevious(breaker)

    # 2. The body's section: the report template's own, with its header and
    #    footer parts (and the logos inside them) carried across.
    body_sect = copy.deepcopy(source_sect)
    used = {part.partname for part in doc.part.package.iter_parts()}

    def unique(partname):
        base, dot, ext = str(partname).rpartition(".")
        n = 1
        candidate = partname
        while candidate in used:
            candidate = PackURI(f"{base}_r{n}{dot}{ext}")
            n += 1
        used.add(candidate)
        return candidate

    for ref in body_sect:
        if ref.tag not in (qn("w:headerReference"), qn("w:footerReference")):
            continue
        part = source.part.related_parts[ref.get(qn("r:id"))]
        part.partname = unique(part.partname)
        for rel in part.rels.values():
            if not rel.is_external:
                rel.target_part.partname = unique(rel.target_part.partname)
        kind = RT.HEADER if ref.tag == qn("w:headerReference") else RT.FOOTER
        ref.set(qn("r:id"), doc.part.relate_to(part, kind))

    body.replace(cover_sect, body_sect)


# ------------------------------------------------------------------ helpers
def _as_doc(doc_or_path):
    from docx import Document

    return Document(doc_or_path) if isinstance(doc_or_path, str) else doc_or_path


def _remark(answer):
    """The cell text for one check point.

    Just the option's short label - "Satisfactory" - so the box stays a single
    line, followed by the inspector's own remark only when they typed one.
    """
    if not answer:
        return ""
    word = answer.get("short") or answer.get("result") or answer.get("display")
    parts = [word, answer.get("remarks")]
    return " - ".join(str(p).strip() for p in parts if str(p or "").strip())


def _join(*parts):
    return "\n".join(str(p) for p in parts if p)
