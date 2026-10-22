"""Upload handling for inspection and front-page photos.

Files are stored under UPLOAD_FOLDER/reports/<report_id>/<kind>/ with a random
stored name, so two inspectors uploading `IMG_0001.jpg` never collide and the
original filename is still shown in the UI.
"""
import mimetypes
import os
import uuid

from flask import current_app
from werkzeug.utils import secure_filename

from utils.errors import ApiError


def _extension(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_allowed_image(filename):
    return _extension(filename) in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]


# Formats every browser shows as-is. Anything else (jfif, tiff, bmp, ...) is
# re-saved as JPEG so it previews in the app and embeds cleanly in Word.
WEB_SAFE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


def _store_image(file_storage, directory):
    """Validate an upload as a real picture, normalise it and save it."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    original = file_storage.filename or "photo"
    allowed = ", ".join(sorted(current_app.config["ALLOWED_IMAGE_EXTENSIONS"]))
    if not is_allowed_image(original):
        raise ApiError(
            f"'{original}' is not a supported image. Allowed: {allowed}.",
            422,
            "unsupported_file",
        )

    try:
        image = Image.open(file_storage.stream)
        image.load()
    except (UnidentifiedImageError, OSError):
        raise ApiError(f"'{original}' could not be read as an image.", 422, "unsupported_file")

    extension = _extension(original)
    # Phone photos are stored sideways with an EXIF "rotate me" flag that Word
    # ignores, so bake the rotation into the pixels.
    rotated = image.getexif().get(0x0112, 1) not in (0, 1)  # EXIF Orientation
    upright = ImageOps.exif_transpose(image) if rotated else image

    if extension in WEB_SAFE_EXTENSIONS and not rotated:
        stored = f"{uuid.uuid4().hex}.{extension}"
        full_path = os.path.join(directory, stored)
        file_storage.stream.seek(0)
        file_storage.save(full_path)
        content_type = file_storage.mimetype or mimetypes.guess_type(stored)[0]
    else:
        keep_alpha = extension in {"png", "gif", "webp"} and upright.mode in ("RGBA", "LA", "P")
        if keep_alpha:
            stored, fmt, content_type = f"{uuid.uuid4().hex}.png", "PNG", "image/png"
            upright = upright.convert("RGBA")
        else:
            stored, fmt, content_type = f"{uuid.uuid4().hex}.jpg", "JPEG", "image/jpeg"
            upright = upright.convert("RGB")
        full_path = os.path.join(directory, stored)
        upright.save(full_path, fmt, **({"quality": 90} if fmt == "JPEG" else {}))

    return {
        "filename": stored,
        "original_name": secure_filename(original)[:255],
        "content_type": content_type,
        "size_bytes": os.path.getsize(full_path),
        "path": full_path,
    }


def report_photo_dir(report_id, kind, create=True):
    path = os.path.join(
        current_app.config["UPLOAD_FOLDER"], "reports", str(report_id), str(kind)
    )
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def save_report_photo(file_storage, report_id, kind):
    """Persist one uploaded image and return its metadata."""
    return _store_image(file_storage, report_photo_dir(report_id, kind))


def photo_path(photo):
    return os.path.join(report_photo_dir(photo.report_id, photo.kind.value, create=False), photo.filename)


def delete_photo_file(photo):
    """Remove the file from disk. A missing file is not an error."""
    try:
        os.remove(photo_path(photo))
    except FileNotFoundError:
        pass


def generated_dir(create=True):
    path = current_app.config["GENERATED_FOLDER"]
    if create:
        os.makedirs(path, exist_ok=True)
    return path


# --------------------------------------------------- shared title-page photos
def set_photo_dir(set_id, slot_key, create=True):
    path = os.path.join(
        current_app.config["UPLOAD_FOLDER"], "sets", str(set_id), str(slot_key)
    )
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def save_set_photo(file_storage, set_id, slot_key):
    """Persist one shared title-page image and return its metadata."""
    return _store_image(file_storage, set_photo_dir(set_id, slot_key))


def set_photo_path(photo):
    return os.path.join(
        set_photo_dir(photo.inspection_set_id, photo.slot_key, create=False), photo.filename
    )


def delete_set_photo_file(photo):
    try:
        os.remove(set_photo_path(photo))
    except FileNotFoundError:
        pass
