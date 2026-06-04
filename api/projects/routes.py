from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from api.utils.org_utils import verify_org_member
from api.projects.services import org_projects_service, create_project_service, project_service, delete_project_service
import uuid

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/organizations/<org_id>/projects")
@jwt_required()
def org_projects(org_id):
    user_id = uuid.UUID(get_jwt_identity())
    org_id = uuid.UUID(org_id)
    exists = verify_org_member(org_id, user_id)
    if not exists:
        return {
            "error": {
                "code": "UNAUTHORIZED",
                "message": "logged user is not a member."
            }
        }, 401
    response = org_projects_service(org_id)
    return response

@projects_bp.route("/organizations/<org_id>/projects", methods=["POST"])
@jwt_required()
def create_project(org_id):
    org_id = uuid.UUID(org_id)
    user_id = get_jwt_identity()
    user_id = uuid.UUID(user_id)
    exists = verify_org_member(org_id, user_id)
    if not exists:
        return {
            "error": {
                "code": "UNAUTHORIZED",
                "message": "logged user is not a member."
            }
        }, 401
    
    data = request.get_json()
    response = create_project_service(org_id, data, user_id)
    return response

@projects_bp.route("/projects/<project_id>")
@jwt_required()
def project(project_id):
    project_id = uuid.UUID(project_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = project_service(project_id, user_id)
    return response

@projects_bp.route("/projects/<project_id>", methods=["DELETE"])
@jwt_required()
def delete_project(project_id):
    project_id = uuid.UUID(project_id)
    user_id = uuid.UUID(get_jwt_identity())
    response = delete_project_service(project_id, user_id)
    return response