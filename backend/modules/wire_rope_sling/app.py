"""Blueprint for the Slings & Lifting Gear module, mounted at /api/modules/wire_rope_sling."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this inspection item below, e.g.:
#
# @blueprint.get("/load-chart")
# @roles_required()
# def load_chart():
#     return {"data": ...}
