"""Turn a generated Word report into a PDF for the reviewer's preview.

Two engines, picked by the PDF_CONVERTER setting:

  libreoffice  `soffice --headless --convert-to pdf`. The production engine -
               install LibreOffice (and the Microsoft core fonts, so Arial
               lays out exactly as in Word) in the server image.
  word         Microsoft Word through PowerShell automation. Windows only, for
               development machines that have Word but not LibreOffice.
               Microsoft does not support Word automation on servers.
  auto         (default) LibreOffice when it can be found, else Word on Windows.

A failed conversion never blocks a submission: callers log it and the preview
offers the Word download instead.
"""
import glob
import logging
import os
import shutil
import subprocess
import sys
import tempfile

from flask import current_app

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 180


class PdfUnavailable(RuntimeError):
    """No converter is installed, or the conversion failed."""


def _find_soffice():
    configured = current_app.config.get("SOFFICE_PATH")
    if configured and os.path.exists(configured):
        return configured
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        "/opt/libreoffice*/program/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for pattern in candidates:
        for path in glob.glob(pattern):
            if os.path.exists(path):
                return path
    return None


def _word_available():
    if sys.platform != "win32":
        return False
    try:
        import winreg

        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, "Word.Application"))
        return True
    except OSError:
        return False


def engine():
    """The engine that will be used, or None when nothing is installed."""
    choice = (current_app.config.get("PDF_CONVERTER") or "auto").lower()
    if choice == "off":
        return None
    if choice in ("auto", "libreoffice"):
        soffice = _find_soffice()
        if soffice:
            return ("libreoffice", soffice)
        if choice == "libreoffice":
            return None
    if choice in ("auto", "word") and _word_available():
        return ("word", None)
    return None


def docx_to_pdf(docx_path):
    """Convert `docx_path` to a PDF beside it and return the PDF's path."""
    chosen = engine()
    if chosen is None:
        raise PdfUnavailable(
            "No PDF converter is installed. Install LibreOffice on the server to enable previews."
        )

    pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
    kind, binary = chosen
    if kind == "libreoffice":
        _convert_libreoffice(binary, docx_path, pdf_path)
    else:
        _convert_word(docx_path, pdf_path)

    if not os.path.exists(pdf_path):
        raise PdfUnavailable("The converter finished but produced no PDF.")
    return pdf_path


def _convert_libreoffice(soffice, docx_path, pdf_path):
    out_dir = os.path.dirname(pdf_path)
    # A private profile per call, so two conversions at once never fight over
    # LibreOffice's profile lock.
    with tempfile.TemporaryDirectory(prefix="lo-profile-") as profile:
        profile_url = "file:///" + profile.replace("\\", "/").lstrip("/")
        command = [
            soffice,
            f"-env:UserInstallation={profile_url}",
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            out_dir,
            docx_path,
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
    if result.returncode != 0:
        raise PdfUnavailable(f"LibreOffice failed: {result.stderr.strip() or result.stdout.strip()}")


_WORD_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($env:DOCX_IN, $false, $true)
    try { $doc.ExportAsFixedFormat($env:PDF_OUT, 17) } finally { $doc.Close($false) }
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
"""


def _convert_word(docx_path, pdf_path):
    # Paths travel as environment variables so no quoting can break the script.
    env = dict(os.environ, DOCX_IN=os.path.abspath(docx_path), PDF_OUT=os.path.abspath(pdf_path))
    result = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", _WORD_SCRIPT],
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
        env=env,
    )
    if result.returncode != 0:
        raise PdfUnavailable(f"Word failed: {result.stderr.strip() or result.stdout.strip()}")


def try_docx_to_pdf(docx_path):
    """docx_to_pdf, but logs and returns None instead of raising."""
    try:
        return docx_to_pdf(docx_path)
    except (PdfUnavailable, subprocess.TimeoutExpired, OSError) as exc:
        log.warning("PDF preview not produced for %s: %s", os.path.basename(docx_path), exc)
        return None
