"""Inspection module registry.

Scans every sub-package of `modules/` at start-up, loads its `module.py`
manifest and registers its `app.py` blueprint under `/api/modules/<slug>`.

Adding a new inspection item is therefore a filesystem operation: copy
`modules/_template/` to `modules/<your_item>/`, edit the manifest, restart.
Nothing else in the codebase needs to change.
"""
import importlib
import logging
import pkgutil
from pathlib import Path

from .base import Checkpoint, ModuleSpec, Section  # noqa: F401

log = logging.getLogger(__name__)

# slug -> ModuleSpec
_REGISTRY = {}
_LOADED = False

# Folders that are infrastructure, not inspection modules.
_SKIP = {"base", "_template"}

MODULES_PATH = Path(__file__).resolve().parent


def discover():
    """Import every module package and collect its manifest. Idempotent."""
    global _LOADED
    if _LOADED:
        return _REGISTRY

    for info in pkgutil.iter_modules([str(MODULES_PATH)]):
        if not info.ispkg or info.name in _SKIP or info.name.startswith("_"):
            continue
        package = f"{__name__}.{info.name}"
        try:
            manifest = importlib.import_module(f"{package}.module")
        except Exception:
            log.exception("Failed to load manifest for module '%s'", info.name)
            continue

        spec = getattr(manifest, "MODULE", None)
        if not isinstance(spec, ModuleSpec):
            log.warning("modules/%s/module.py does not define a MODULE ModuleSpec", info.name)
            continue

        spec.package = package
        spec.root_path = str(MODULES_PATH / info.name)

        if spec.slug in _REGISTRY:
            log.warning("Duplicate module slug '%s' - keeping the first one found", spec.slug)
            continue

        # Pull in the module's own tables so migrations see them.
        try:
            importlib.import_module(f"{package}.models")
        except ModuleNotFoundError:
            pass
        except Exception:
            log.exception("Failed to load models for module '%s'", info.name)

        _REGISTRY[spec.slug] = spec
        log.info("Registered inspection module '%s' (%s)", spec.slug, spec.name)

    _LOADED = True
    return _REGISTRY


def register_blueprints(app, url_prefix="/api/modules"):
    """Mount each module's own blueprint, if it ships one."""
    for spec in discover().values():
        try:
            mod = importlib.import_module(f"{spec.package}.app")
        except ModuleNotFoundError:
            continue
        except Exception:
            log.exception("Failed to import app.py for module '%s'", spec.slug)
            continue

        blueprint = getattr(mod, "blueprint", None)
        if blueprint is None:
            continue
        app.register_blueprint(blueprint, url_prefix=f"{url_prefix}/{spec.slug}")
        log.info("Mounted blueprint for module '%s' at %s/%s", spec.slug, url_prefix, spec.slug)


# ------------------------------------------------------------------ accessors
def all_modules(include_disabled=False):
    mods = discover().values()
    if not include_disabled:
        mods = [m for m in mods if m.enabled]
    return sorted(mods, key=lambda m: (m.order, m.name))


def get_module(slug):
    return discover().get(slug)


def module_slugs():
    return list(discover().keys())
