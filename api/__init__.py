from flask import Blueprint
from .auth.routes import auth_bp
from .organizations.routes import org_bp
from .projects.routes import projects_bp
from .tasks.routes import tasks_bp
from .users.routes import users_bp

api_bp = Blueprint("api", __name__)

api_bp.register_blueprint(auth_bp)
api_bp.register_blueprint(org_bp)
api_bp.register_blueprint(projects_bp)
api_bp.register_blueprint(tasks_bp)
api_bp.register_blueprint(users_bp)
