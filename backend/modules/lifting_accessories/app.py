"""Blueprint for the Lifting Accessories module, mounted at /api/modules/lifting_accessories."""
from modules.blueprint_factory import make_blueprint

from .module import MODULE

blueprint = make_blueprint(MODULE)

# Add endpoints specific to this service category below.
