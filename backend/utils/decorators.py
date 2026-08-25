"""Auth helpers shared by every blueprint."""
from functools import wraps

from flask import g
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from models import Role, User

from .errors import ApiError


def current_user():
    """The authenticated User, cached on the request context."""
    if "current_user" not in g:
        verify_jwt_in_request()
        user = User.query.get(int(get_jwt_identity()))
        if user is None or not user.is_active:
            raise ApiError("Account not found or disabled.", 401, "account_inactive")
        g.current_user = user
    return g.current_user


def roles_required(*roles):
    """Restrict a view to the given roles. No roles means any signed-in user.

    Admins pass every check - they are the superset role.
    """

    allowed = set(roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if allowed and user.role not in allowed and user.role is not Role.ADMIN:
                raise ApiError(
                    "You do not have permission to perform this action.", 403, "forbidden"
                )
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def module_route(fn):
    """Resolve `<slug>` in a module URL to its registered spec.

    Injects the spec as the `module_spec` keyword argument.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        from modules import get_module

        slug = kwargs.pop("slug", None)
        spec = get_module(slug)
        if spec is None:
            raise ApiError(f"Unknown inspection module '{slug}'.", 404, "module_not_found")
        return fn(*args, module_spec=spec, **kwargs)

    return wrapper
