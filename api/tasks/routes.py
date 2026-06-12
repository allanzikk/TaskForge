from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from api.tasks.services import tasks_service, create_task_service, delete_task_service, edit_task_service, complete_task_service, task_service
from datetime import datetime

tasks_bp = Blueprint("tasks", __name__)

@tasks_bp.route("/projects/<project_id>/tasks")
@jwt_required()
def tasks(project_id):
    user_id = get_jwt_identity()
    cursor_created_at = request.args.get("cursor_created_at")
    cursor_id = request.args.get("cursor_id")
    limit = request.args.get("limit")

    if cursor_created_at and cursor_id:
        cursor_created_at = datetime.fromisoformat(cursor_created_at)
    else:
        cursor_created_at = None
        cursor_id = None
    response = tasks_service(project_id, user_id, cursor_created_at, cursor_id, limit)
    return response

@tasks_bp.route("/projects/<project_id>/tasks", methods=["POST"])
@jwt_required()
def create_task(project_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    response = create_task_service(data, project_id, user_id)
    return response

@tasks_bp.route("/tasks/<task_id>")
@jwt_required()
def task(task_id):
    user_id = get_jwt_identity()
    response = task_service(task_id, user_id)
    return response


@tasks_bp.route("/tasks/<task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    user_id = get_jwt_identity()

    response = delete_task_service(task_id, user_id)
    return response

@tasks_bp.route("/tasks/<task_id>", methods=["PATCH"])
@jwt_required()
def edit_task(task_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    response = edit_task_service(task_id, user_id, data)
    return response

@tasks_bp.route("/tasks/<task_id>/complete")
@jwt_required()
def complete_task(task_id):
    user_id = get_jwt_identity()
    response = complete_task_service(task_id, user_id)
    return response