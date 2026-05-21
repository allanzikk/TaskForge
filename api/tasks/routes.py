from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
import uuid
from api.tasks.services import tasks_service, create_task_service, delete_task_service, edit_task_service

tasks_bp = Blueprint("tasks", __name__)

@tasks_bp.route("/projects/<project_id>/tasks")
@jwt_required()
def tasks(project_id):
    project_id = uuid.UUID(project_id)
    user_id = uuid.UUID(get_jwt_identity())

    response = tasks_service(project_id, user_id)
    return response

@tasks_bp.route("/projects/<project_id>/tasks", methods=["POST"])
@jwt_required()
def create_task(project_id):
    project_id = uuid.UUID(project_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.get_json()
    response = create_task_service(data, project_id, user_id)
    return response

@tasks_bp.route("/tasks/<task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    task_id = uuid.UUID(task_id)
    user_id = uuid.UUID(get_jwt_identity())

    response = delete_task_service(task_id, user_id)
    return response

@tasks_bp.route("/tasks/<task_id>", methods=["PATCH"])
@jwt_required()
def edit_task(task_id):
    task_id = uuid.UUID(task_id)
    user_id = uuid.UUID(get_jwt_identity())
    data = request.get_json()
    response = edit_task_service(task_id, user_id, data)
    return response