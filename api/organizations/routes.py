from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import organizations_service, create_organization_service, organization_service, remove_organization_service

org_bp = Blueprint("organizations", __name__)


@org_bp.route("/organizations", methods=["GET"])
@jwt_required()
def organizations():
    response = organizations_service()
    return response

@org_bp.route("/organizations", methods=["POST"])
@jwt_required()
def create_organization():
    owner_id = get_jwt_identity()
    data = request.get_json()
    response = create_organization_service(data, owner_id)
    return response

@org_bp.route("/organizations/<org_id>", methods=["GET"])
@jwt_required()
def organization(org_id):
    response = organization_service(org_id)
    return response

@org_bp.route("/organizations/<org_id>", methods=["DELETE"])
@jwt_required()
def remove_organization(org_id):
    response = remove_organization_service(org_id)
    return response