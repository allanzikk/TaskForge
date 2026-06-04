from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from .services import organizations_service, create_organization_service, organization_service, remove_organization_service, invite_service, accept_invite_service, members_service, member_service, edit_member_service, edit_org_service, remove_img_service, leave_org_service, reject_invite_service, transfer_ownership_service, search_organization_service
import uuid

org_bp = Blueprint("organizations", __name__)


@org_bp.route("/organizations")
@jwt_required()
def organizations():
    user_id = uuid.UUID(get_jwt_identity())
    response = organizations_service(user_id)
    return response

@org_bp.route("/organizations", methods=["POST"])
@jwt_required()
def create_organization():
    owner_id = uuid.UUID(get_jwt_identity())
    data = request.form.copy()
    data["img"] = request.files.get("img")

    response = create_organization_service(data, owner_id)
    return response

@org_bp.route("/organizations/search")
@jwt_required()
def search_organization():
    name = request.args.get("name")
    user_id = uuid.UUID(get_jwt_identity())
    response = search_organization_service(user_id, name)
    return response

@org_bp.route("/organizations/<org_id>")
@jwt_required()
def organization(org_id):
    org_id = uuid.UUID(org_id)
    response = organization_service(org_id)
    return response

@org_bp.route("/organizations/<org_id>", methods=["PATCH"])
@jwt_required()
def edit_org(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.form.copy()
    data["img"] = request.files.get("img")
    response = edit_org_service(data, org_id, user_id)
    return response


@org_bp.route("/organizations/<org_id>", methods=["DELETE"])
@jwt_required()
def remove_organization(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = remove_organization_service(org_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/members")
@jwt_required()
def members(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = members_service(org_id, user_id)
    return response

@org_bp.route("/organizations/members/<member_id>")
@jwt_required()
def member(member_id):
    member_id = uuid.UUID(member_id)
    response = member_service(member_id)
    return response

@org_bp.route("/organizations/members/<member_id>", methods=["PATCH"])
@jwt_required()
def edit_member(member_id):
    member_id = uuid.UUID(member_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.get_json()
    response = edit_member_service(data, member_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/invite", methods=["POST"])
@jwt_required()
def invite(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.get_json()
    user_invited_id = uuid.UUID(data.get("user_invited_id"))
    response = invite_service(user_invited_id, org_id, user_id)
    return response

@org_bp.route("/invite/<invite_id>")
@jwt_required()
def accept_invite(invite_id):
    invite_id = uuid.UUID(invite_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = accept_invite_service(invite_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/remove-img", methods=["DELETE"])
@jwt_required()
def remove_img(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = remove_img_service(org_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/leave", methods=["DELETE"])
@jwt_required()
def leave_org(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = leave_org_service(org_id, user_id)
    return response

@org_bp.route("/invite/<invite_id>", methods=["DELETE"])
@jwt_required()
def reject_invite(invite_id):
    invite_id = uuid.UUID(invite_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = reject_invite_service(invite_id, user_id)
    return response

@org_bp.route("/organizations/<org_id>/transfer-ownership", methods=["POST"])
@jwt_required()
def transfer_ownership(org_id):
    org_id = uuid.UUID(org_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.get_json()
    response = transfer_ownership_service(data, org_id, user_id)
    return response
