"""A single JSON error shape for the whole API."""
import logging

from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)


class ApiError(Exception):
    """Raise this anywhere in a view to return a structured error."""

    def __init__(self, message, status=400, code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code or f"error_{status}"
        self.details = details or {}

    def to_dict(self):
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _api_error(exc):
        return exc.to_dict(), exc.status

    @app.errorhandler(HTTPException)
    def _http_error(exc):
        return {
            "error": {
                "code": f"http_{exc.code}",
                "message": exc.description,
                "details": {},
            }
        }, exc.code

    @app.errorhandler(Exception)
    def _unhandled(exc):
        log.exception("Unhandled exception")
        if app.debug:
            raise exc
        return {
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred.",
                "details": {},
            }
        }, 500
