from models.project import Project
import uuid

def verify_project(org_id, project_name):
    project = Project.query.filter_by(org_id=org_id, name=project_name).first()
    if project:
        return True
    return False