from flask import Flask
from extensions import db, bcrypt, jwt, migrate, cors, socketio
from dotenv import load_dotenv
import os
from api import api_bp
from api.organizations.events import *
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import timedelta

def create_app():
    app = Flask(__name__)
    load_dotenv()

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key")
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-jwt-key")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("SQLALCHEMY_DATABASE_URI")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=15)
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)

    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, origins=["https://www.taskforge.app.br", "http://127.0.0.1:5000", "http://localhost:5000"], methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "Authorization"])
    socketio.init_app(app, cors_allowed_origins=["http://localhost:5000", "https://www.taskforge.app.br"])

    

    app.register_blueprint(api_bp)
    return app