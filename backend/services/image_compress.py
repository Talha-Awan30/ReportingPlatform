"""Shrink photographs before they go into a report.

Phone cameras produce 4-15 MB pictures; printed in a 75 mm box on an A4 page
they need a fraction of that. Every picture placed in a Word report goes
through here, so the .docx - and the PDF made from it - stay a few MB instead
of tens. The uploaded original on disk is never touched.
"""
import io

# Longest side in pixels. 1600 px across a 75-160 mm box is well over 250 dpi.
MAX_EDGE = 1600
JPEG_QUALITY = 80
# A JPEG/PNG already this small and within MAX_EDGE is embedded as it is.
PASS_THROUGH_BYTES = 400 * 1024


def compressed_stream(path, aspect=None):
    """The picture at `path` as an embeddable JPEG/PNG stream, sized for print.

    Applies the EXIF rotation phone cameras rely on. With `aspect` (width /
    height) the picture is centre-cropped to exactly that shape, so it fills
    its box without being stretched.
    """
    import os

    from PIL import Image, ImageOps

    image = Image.open(path)
    rotated = image.getexif().get(0x0112, 1) not in (0, 1)  # EXIF Orientation
    small = max(image.size) <= MAX_EDGE and os.path.getsize(path) <= PASS_THROUGH_BYTES
    if not aspect and not rotated and small and image.format in ("JPEG", "PNG"):
        # Already embeddable and already small - keep the original bytes.
        with open(path, "rb") as handle:
            return io.BytesIO(handle.read())

    if rotated:
        image = ImageOps.exif_transpose(image)
    if aspect:
        width = min(image.width, MAX_EDGE)
        image = ImageOps.fit(image, (width, max(1, round(width / aspect))), Image.LANCZOS)
    elif max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

    stream = io.BytesIO()
    transparent = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    if transparent:
        # Logos and QR codes with transparency stay PNG - JPEG would blacken it.
        image.convert("RGBA").save(stream, "PNG", optimize=True)
    else:
        image.convert("RGB").save(stream, "JPEG", quality=JPEG_QUALITY, optimize=True)
    stream.seek(0)
    return stream
