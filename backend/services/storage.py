"""Upload handling for inspection and front-page photos.

Files are stored under UPLOAD_FOLDER/reports/<report_id>/<kind>/ with a random
stored name, so two inspectors uploading `IMG_0001.jpg` never collide and the
original filename is still shown in the UI.
"""
import os
import uuid

from flask import current_app
from werkzeug.utils import secure_filename

from utils.errors import ApiError


def _extension(filename):
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_allowed_image(filename):
    return _extension(filename) in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]


def report_photo_dir(report_id, kind, create=True):
    path = os.path.join(
        current_app.config["UPLOAD_FOLDER"], "reports", str(report_id), str(kind)
    )
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def save_report_photo(file_storage, report_id, kind):
    """Persist one uploaded image and return its metadata."""
    original = file_storage.filename or "photo"
    if not is_allowed_image(original):
        allowed = ", ".join(sorted(current_app.config["ALLOWED_IMAGE_EXTENSIONS"]))
        raise ApiError(
            f"'{original}' is not a supported image. Allowed: {allowed}.",
            422,
            "unsupported_file",
        )

    stored = f"{uuid.uuid4().hex}.{_extension(original)}"
    directory = report_photo_dir(report_id, kind)
    full_path = os.path.join(directory, stored)
    file_storage.save(full_path)

    return {
        "filename": stored,
        "original_name": secure_filename(original)[:255],
        "content_type": file_storage.mimetype,
        "size_bytes": os.path.getsize(full_path),
        "path": full_path,
    }


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
    original = file_storage.filename or "photo"
    if not is_allowed_image(original):
        allowed = ", ".join(sorted(current_app.config["ALLOWED_IMAGE_EXTENSIONS"]))
        raise ApiError(
            f"'{original}' is not a supported image. Allowed: {allowed}.",
            422,
            "unsupported_file",
        )

    stored = f"{uuid.uuid4().hex}.{_extension(original)}"
    full_path = os.path.join(set_photo_dir(set_id, slot_key), stored)
    file_storage.save(full_path)

    return {
        "filename": stored,
        "original_name": secure_filename(original)[:255],
        "content_type": file_storage.mimetype,
        "size_bytes": os.path.getsize(full_path),
        "path": full_path,
    }


def set_photo_path(photo):
    return os.path.join(
        set_photo_dir(photo.inspection_set_id, photo.slot_key, create=False), photo.filename
    )


def delete_set_photo_file(photo):
    try:
        os.remove(set_photo_path(photo))
    except FileNotFoundError:
        pass
