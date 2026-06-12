from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import OrgsServicesManager

org_bp = Blueprint("organizations", __name__)


@org_bp.route("/organizations")
@jwt_required()
def organizations():
    user_id = get_jwt_identity()
    response = OrgsServicesManager.organizations_service(user_id)
    return response

@org_bp.route("/organizations", methods=["POST"])
@jwt_required()
def create_organization():
    owner_id = get_jwt_identity()
    data = request.form.copy()
    data["img"] = request.files.get("img")

    response = OrgsServicesManager.create_organization_service(data, owner_id)
    return response

@org_bp.route("/organizations/search")
@jwt_required()
def search_organization():
    name = request.args.get("name")
    user_id = get_jwt_identity()
    response = OrgsServicesManager.search_organization_service(user_id, name)
    return response

@org_bp.route("/organizations/<org_id>")
@jwt_required()
def organization(org_id):
    response = OrgsServicesManager.organization_service(org_id)
    return response

@org_bp.route("/organizations/<org_id>", methods=["PATCH"])
@jwt_required()
def edit_org(org_id):
    user_id = get_jwt_identity()
    data = request.form.copy()
    data["img"] = request.files.get("img")
    response = OrgsServicesManager.edit_org_service(data, org_id, user_id)
    return response


@org_bp.route("/organizations/<org_id>", methods=["DELETE"])
@jwt_required()
def remove_organization(org_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.remove_organization_service(org_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/members")
@jwt_required()
def members(org_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.members_service(org_id, user_id)
    return response

@org_bp.route("/organizations/members/<member_id>")
@jwt_required()
def member(member_id):
    response = OrgsServicesManager.member_service(member_id)
    return response

@org_bp.route("/organizations/members/<member_id>", methods=["PATCH"])
@jwt_required()
def edit_member(member_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    response = OrgsServicesManager.edit_member_service(data, member_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/invite", methods=["POST"])
@jwt_required()
def invite(org_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    user_invited_id = data.get("user_invited_id")
    response = OrgsServicesManager.invite_service(user_invited_id, org_id, user_id)
    return response

@org_bp.route("/invite/<invite_id>")
@jwt_required()
def accept_invite(invite_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.accept_invite_service(invite_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/remove-img", methods=["DELETE"])
@jwt_required()
def remove_img(org_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.remove_img_service(org_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/leave", methods=["DELETE"])
@jwt_required()
def leave_org(org_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.leave_org_service(org_id, user_id)
    return response

@org_bp.route("/invite/<invite_id>", methods=["DELETE"])
@jwt_required()
def reject_invite(invite_id):
    user_id = get_jwt_identity()
    response = OrgsServicesManager.reject_invite_service(invite_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/transfer-ownership", methods=["POST"])
@jwt_required()
def transfer_ownership(org_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    response = OrgsServicesManager.transfer_ownership_service(data, org_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/messages")
@jwt_required()
def messages(org_id):
    user_id = get_jwt_identity()
    before_id = request.args.get("before_id")
    limit = request.args.get("limit")
    response = OrgsServicesManager.messages_service(org_id, user_id, before_id, limit)
    return response