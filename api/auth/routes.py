from flask import Blueprint, request
from .services import login_service, create_account_service
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    response = login_service(data)
    return response

@auth_bp.route("/create-account", methods=["POST"])
def create_account():
    data = request.get_json()
    response = create_account_service(data)
    return response

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    access_token = create_access_token(identity=str(current_user_id))
    return {"access_token": access_token}
