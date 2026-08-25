"""Blueprint for the Man Lift / MEWP module, mounted at /api/modules/man_lift."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this inspection item below, e.g.:
#
# @blueprint.get("/load-chart")
# @roles_required()
# def load_chart():
#     return {"data": ...}
