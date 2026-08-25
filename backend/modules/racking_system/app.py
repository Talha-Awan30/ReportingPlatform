"""Blueprint for the Racking System module, mounted at /api/modules/racking_system."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this service category below.
