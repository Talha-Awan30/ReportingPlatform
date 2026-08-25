"""Blueprint for the Tower Inspection module, mounted at /api/modules/tower_inspection."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this service category below.
