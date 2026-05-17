from flask import Blueprint
from .auth.routes import auth_bp
from .organizations.routes import org_bp

api_bp = Blueprint("api", __name__, url_prefix="/api")

api_bp.register_blueprint(auth_bp)
api_bp.register_blueprint(org_bp)