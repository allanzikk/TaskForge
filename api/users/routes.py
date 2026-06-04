from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import user_service, invites_service, edit_user_service, remove_pfp_service, search_user_service
import uuid

users_bp = Blueprint("users", __name__)


@users_bp.route("/users")
@jwt_required()
def user():
    user_id = uuid.UUID(request.args.get("id"))
    response = user_service(user_id)
    return response

@users_bp.route("/users/<username>")
@jwt_required()
def search_user(username):
    response = search_user_service(username)
    return response

@users_bp.route("/users/<username>", methods=["PATCH"])
@jwt_required()
def edit_user(username):
    data = request.form.copy()
    data["img"] = request.files.get("img")
    user_id = uuid.UUID(get_jwt_identity())
    response = edit_user_service(data,username, user_id)
    return response
    
@users_bp.route("/users/invites")
@jwt_required()
def invites():
    user_id = uuid.UUID(get_jwt_identity())
    response = invites_service(user_id)
    return response

@users_bp.route("/users/remove-pfp", methods=["DELETE"])
@jwt_required()
def remove_pfp():
    user_id = uuid.UUID(get_jwt_identity())
    response = remove_pfp_service(user_id)
    return response