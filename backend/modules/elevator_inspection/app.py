"""Blueprint for the Elevator Inspection module, mounted at /api/modules/elevator_inspection."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this service category below.
