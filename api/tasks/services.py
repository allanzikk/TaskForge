from models.project import Project
from extensions import db
from ..utils.responses import success, error
from ..utils.org_utils import verify_org_member
from models.task import Task



def tasks_service(project_id, user_id):
    project = db.session.get(Project, project_id)
    if not verify_org_member(project.org_id, user_id):
        return error(
            code="ORGANIZATION_ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)

    tasks_json = []
    for i in project.tasks:
        task = {
            "id": i.id,
            "name": i.name,
            "description": i.description
        }
        tasks_json.append(task)
    
    return success(data=tasks_json)

def create_task_service(data, project_id, user_id):
    project = db.session.get(Project, project_id)
    member = verify_org_member(project.org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    name = data.get("name")
    desc = data.get("description")

    task = Task(name=name, description=desc, project=project)
    db.session.add(task)
    db.session.commit()
    return success(
        data={
            "name": name,
            "id": task.id,
            "description": task.description,
            "project_name": project.name,
            "project_id": project.id
        }
    )

def delete_task_service(task_id, user_id):
    task = db.session.get(Task, task_id)
    member = verify_org_member(task.project.org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)

    db.session.delete(task)
    db.session.commit()
    return success(message="done.")