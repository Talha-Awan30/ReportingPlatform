"""Blueprint for the Mobile Crane module, mounted at /api/modules/mobile_crane."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this inspection item below, e.g.:
#
# @blueprint.get("/load-chart")
# @roles_required()
# def load_chart():
#     return {"data": ...}
