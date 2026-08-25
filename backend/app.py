"""Application factory for the Lifting Equipment Reporting Platform.

    flask --app app run --debug     # development
    python app.py                   # same thing, shorter

Core blueprints live under core/, one per area. Inspection modules live under
modules/ and are discovered and mounted automatically at start-up.
"""
import logging
import os

from flask import Flask, jsonify

import models  # noqa: F401  - registers every table with the metadata
from config import get_config
from extensions import cors, db, jwt, migrate
from utils.errors import register_error_handlers

# Core blueprints: (module, url_prefix)
CORE_BLUEPRINTS = [
    ("core.auth", "/api/auth"),
    ("core.dashboard", "/api/dashboard"),
    ("core.clients", "/api/clients"),
    ("core.jobs", "/api/jobs"),
    ("core.equipment", "/api/equipment"),
    ("core.reports", "/api/reports"),
    ("core.users", "/api/users"),
    ("core.masterlists", "/api/master-lists"),
    ("core.alerts", "/api/alerts"),
    ("core.inspection_modules", "/api/modules"),
]


def create_app(config_name=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(get_config(config_name))

    _configure_logging(app)
    _ensure_directories(app)
    _init_extensions(app)
    _register_blueprints(app)
    _register_jwt_handlers(app)
    _register_cli(app)
    register_error_handlers(app)

    @app.get("/api/health")
    def health():
        from modules import module_slugs

        return jsonify(
            status="ok",
            service="lifting-equipment-reporting",
            modules=module_slugs(),
        )

    return app


# --------------------------------------------------------------------- set-up
def _configure_logging(app):
    logging.basicConfig(
        level=logging.DEBUG if app.debug else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )


def _ensure_directories(app):
    for key in ("UPLOAD_FOLDER", "GENERATED_FOLDER"):
        os.makedirs(app.config[key], exist_ok=True)
    os.makedirs(app.instance_path, exist_ok=True)


def _init_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )


def _register_blueprints(app):
    import importlib

    from modules import register_blueprints as register_module_blueprints

    for path, prefix in CORE_BLUEPRINTS:
        module = importlib.import_module(path)
        app.register_blueprint(module.bp, url_prefix=prefix)

    # Each inspection module mounts at /api/modules/<slug>.
    register_module_blueprints(app)


def _register_jwt_handlers(app):
    @jwt.expired_token_loader
    def _expired(_header, _payload):
        return {"error": {"code": "token_expired", "message": "Your session has expired. Please sign in again."}}, 401

    @jwt.invalid_token_loader
    def _invalid(reason):
        return {"error": {"code": "token_invalid", "message": f"Invalid session: {reason}"}}, 401

    @jwt.unauthorized_loader
    def _missing(reason):
        return {"error": {"code": "token_missing", "message": "Sign in to continue.", "details": {"reason": reason}}}, 401


def _register_cli(app):
    import click

    @app.cli.command("seed")
    def seed_command():
        """Create the tables, master lists, equipment types and the admin account."""
        from seed import run_seed

        run_seed()

    @app.cli.command("scan-expiry")
    @click.option("--dry-run", is_flag=True, help="Report what would be sent without sending it.")
    def scan_expiry_command(dry_run):
        """Run the certification expiry scan immediately."""
        from services.expiry import scan_and_send

        click.echo(scan_and_send(dry_run=dry_run))

    @app.cli.command("list-modules")
    def list_modules_command():
        """Show every discovered inspection module."""
        from modules import all_modules

        for spec in all_modules(include_disabled=True):
            state = "configured" if spec.is_configured else "scaffold"
            click.echo(f"  {spec.slug:<18} {spec.name:<24} {state:<11} {len(spec.checkpoints):>3} checkpoints")


app = create_app()

if __name__ == "__main__":
    # The scheduler only runs in the process that actually serves requests, so
    # the debug reloader does not start it twice.
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        from services.expiry import start_scheduler

        with app.app_context():
            start_scheduler(app)

    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=app.config.get("DEBUG", False))
