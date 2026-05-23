from extensions import db
from ..utils.responses import success, error
from ..utils.org_utils import verify_org_member
from ..utils.project_utils import get_project_by_id
from models.task import Task



def tasks_service(project_id, user_id):
    project = get_project_by_id(project_id)
    if not project:
        return error(code="NOT_FOUND", message="project not found.", status=404)

    if not verify_org_member(project.org_id, user_id):
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)

    tasks_json = []
    for i in project.tasks:
        task = {
            "id": i.id,
            "name": i.name,
            "priority": i.priority,
            "is_completed": i.is_completed,
            "created_at": i.created_at
        }
        tasks_json.append(task)
    
    return success(data=tasks_json)

def task_service(task_id, user_id):
    task = db.session.get(Task, task_id)
    if not task:
        return error(code="NOT_FOUND", message="task not found.", status=404)
    member = verify_org_member(task.project.org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    return success(data={
        "id": task.id,
        "name": task.name,
        "description": task.description,
        "priority": task.priority,
        "created_at": task.created_at,
        "is_completed": task.is_completed,
        "project_id": task.project_id,
        "project_name": task.project.name,
    })


def create_task_service(data, project_id, user_id):
    project = get_project_by_id(project_id)
    if not project:
        return error(code="NOT_FOUND", message="project not found.", status=404)

    member = verify_org_member(project.org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    
    name = data.get("name")
    desc = data.get("description")
    priority = data.get("priority")
    if not name or not desc or not priority:
        return error(code="INVALID_DATA", message="name, priority and description are required.")
    if not 3 <= len(name) <= 30:
        return error(code="INVALID_DATA", message="name out of limits (3-30).")
    
    if not 3 <= len(desc) <= 120:
        return error(code="INVALID_DATA", message="description out of limits (3-120).")
    
    if priority not in ["low", "normal", "high", "very high"]:
        return error(code="INVALID_DATA", message="priority is not in the allowed formats ('low', 'normal', 'high', 'very high').")

    task_exist = Task.query.filter_by(name=name).first()
    if task_exist:
        return error(code="CONFLICT", message="task already exists.", status=409)

    task = Task(name=name, description=desc, project=project, priority=priority)
    db.session.add(task)
    db.session.commit()
    return success(
        data={
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "priority": task.priority,
            "created_at": task.created_at,
            "is_completed": task.is_completed,
            "project_id": task.project_id
        }
    )

def delete_task_service(task_id, user_id):
    task = db.session.get(Task, task_id)
    if not task:
        return error(code="NOT_FOUND", message="task not found.", status=404)

    member = verify_org_member(task.project.org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)

    if task.is_completed:
        task.project.tasks_completed -= 1

    db.session.delete(task)
    db.session.commit()
    return success(message="done.")

def edit_task_service(task_id, user_id, data):
    task = db.session.get(Task, task_id)
    if not task:
        return error(code="NOT_FOUND", message="task not found.", status=404)
    
    member = verify_org_member(task.project.org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    name = data.get("name")
    desc = data.get("description")
    priority = data.get("priority")
    if not (name or desc or priority):
        return error(code="INVALID_DATA", message="name, priority or description are required.")

    if name:
        if not 3 <= len(name) <= 30:
            return error(code="INVALID_DATA", message="name out of limits (3-30).")
        task.name = name
    if desc:
        if not 3 <= len(desc) <= 120:
            return error(code="INVALID_DATA", message="description out of limits (3-120).")
        task.description = desc
    if priority:
        if priority not in ["low", "normal", "high", "very high"]:
            return error(code="INVALID_DATA", message="priority is not in the allowed formats ('low', 'normal', 'high', 'very high'))")
        task.priority = priority

    db.session.commit()
    return success(
        data={
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "priority": task.priority,
            "created_at": task.created_at,
            "is_completed": task.is_completed,
            "project_id": task.project_id
        }
    )

def complete_task_service(task_id, user_id):
    task = db.session.get(Task, task_id)
    if not task:
        return error(code="NOT_FOUND", message="task not found.", status=404)
    
    member = verify_org_member(task.project.org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if task.is_completed:
        return error(code="CONFLICT", message="task already completed.", status=409)

    task.is_completed = True
    task.project.tasks_completed += 1
    db.session.commit()
    return success(
        data={
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "priority": task.priority,
            "created_at": task.created_at,
            "is_completed": task.is_completed,
            "project_id": task.project_id
        }
    )
