from extensions import db
from models.organization import Organization
from models.project import Project
from models.member import Member
import uuid
from ..utils.project_utils import verify_project
from ..utils.org_utils import verify_org_member
from api.utils.responses import success, error






def org_projects_service(org_id):
    org_id = uuid.UUID(org_id)
    org = db.session.get(Organization, org_id)
    projects_json = []
    for i in org.projects:
        project = {
            "project_id": i.id,
            "name": i.name
        }
        projects_json.append(project)
    return projects_json, 200

def create_project_service(org_id, data, user_id):
    name = data.get("name")
    exists = verify_project(org_id, name)
    if exists:
        return error(code="CONFLICT", status=409, message="project already exists.")
    



    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED", 
            message="user doesnt have acces to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)
    
    org = db.session.get(Organization, org_id)
    project = Project(name=name, org=org)
    db.session.add(project)
    db.session.commit()
    return success(
        data={
            "name": name,
            "id": project.id,
            "org_name": org.name,
            "org_id": org.id
        }
    )