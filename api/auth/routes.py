from flask import Blueprint, request
from .services import login_service, create_account_service

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