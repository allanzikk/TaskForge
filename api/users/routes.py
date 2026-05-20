from flask import Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import user_service, invites_service
import uuid

users_bp = Blueprint("users", __name__)


@users_bp.route("/users/<username>")
@jwt_required()
def user(username):
    response = user_service(username)
    return response

@users_bp.route("/users/invites")
@jwt_required()
def invites():
    user_id = uuid.UUID(get_jwt_identity())
    response = invites_service(user_id)
    return response