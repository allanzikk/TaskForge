from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import user_service, invites_service, edit_user_service, remove_pfp_service, search_user_service

users_bp = Blueprint("users", __name__)


@users_bp.route("/users/<id>")
@jwt_required()
def user(id):
    response = user_service(id)
    return response

@users_bp.route("/users")
@jwt_required()
def search_user():
    username = request.args.get("username")
    response = search_user_service(username)
    return response

@users_bp.route("/users", methods=["PATCH"])
@jwt_required()
def edit_user():
    data = request.form.copy()
    data["img"] = request.files.get("img")
    user_id = get_jwt_identity()
    response = edit_user_service(data, user_id)
    return response
    
@users_bp.route("/users/invites")
@jwt_required()
def invites():
    user_id = get_jwt_identity()
    response = invites_service(user_id)
    return response

@users_bp.route("/users/remove-pfp", methods=["DELETE"])
@jwt_required()
def remove_pfp():
    user_id = get_jwt_identity()
    response = remove_pfp_service(user_id)
    return response
