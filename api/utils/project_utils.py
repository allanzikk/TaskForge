from models.project import Project
from extensions import db

def get_project_by_name(org_id, project_name):
    project = Project.query.filter_by(org_id=org_id, name=project_name).first()
    if project:
        return True
    return False

def get_project_by_id(project_id):
    project = db.session.get(Project, project_id)
    return project