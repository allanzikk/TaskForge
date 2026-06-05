from flask import Flask
from extensions import db, bcrypt, jwt, migrate, cors
from dotenv import load_dotenv
import os
from api import api_bp
from time import sleep

def create_app():
    app = Flask(__name__)
    load_dotenv()

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key")
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-jwt-key")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("SQLALCHEMY_DATABASE_URI")

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, origins=["https://celadon-florentine-958922.netlify.app"], methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "Authorization"])


    with app.app_context():
        while True:
            try:
                db.engine.connect()
                break
            except Exception:
                sleep(2)

        from flask_migrate import upgrade
        upgrade()

    app.register_blueprint(api_bp)
    return app