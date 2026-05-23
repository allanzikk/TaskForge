from extensions import db
from models.organization import Organization
from models.project import Project
from ..utils.project_utils import get_project_by_name, get_project_by_id
from ..utils.org_utils import verify_org_member, get_org_by_id
from api.utils.responses import success, error






def org_projects_service(org_id):
    org = get_org_by_id(org_id)
    if not org:
        return error("NOT_FOUND", "org not found.", status=404)

    projects_json = []
    for i in org.projects:
        project = {
            "project_id": i.id,
            "name": i.name,
            "progress": round(i.tasks_completed / len(i.tasks) * 100, 1) if i.tasks else 0,
            "created_at": i.created_at
        }
        projects_json.append(project)
    return projects_json, 200

def create_project_service(org_id, data, user_id):
    name = data.get("name")
    if not name:
        return error("INVALID_DATA", "name can't be empty.")
    if not 3 <= len(name) <= 30:
        return error(code="INVALID_DATA", message="name out of limit (3-30).")

    org = get_org_by_id(org_id)
    if org is None:
        return error(code="NOT_FOUND", message="org id not found.", status=404)

    project = get_project_by_name(org_id, name)
    if project:
        return error(code="CONFLICT", status=409, message="project already exists.")
    
    
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED", 
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)

    project = Project(name=name, org=org)
    db.session.add(project)
    db.session.commit()
    return success(
        data={
            "name": project.name,
            "id": project.id,
            "progress": 0,
            "created_at": project.created_at,
            "org_name": org.name,
            "org_id": org.id
        }
    )

def project_service(project_id, user_id):
    project = get_project_by_id(project_id)
    if not project:
        return error(code="NOT_FOUND", message="project not found.", status=404)

    member = verify_org_member(project.org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED", 
            message="user doesnt have access to this organization.",
            status=403)

    tasks = []
    for i in project.tasks:
        task = {
            "id": i.id,
            "name": i.name,
            "is_completed": i.is_completed
        }
        tasks.append(task)
    return success(data={
        "id": project.id,
        "name": project.name,
        "created_at": project.created_at,
        "progress": round(project.tasks_completed / len(project.tasks) * 100, 1) if project.tasks else 0,
        "org_id": project.org_id,
        "tasks": tasks
    })