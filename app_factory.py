from flask import Flask
from extensions import db, bcrypt, jwt, migrate
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

    with app.app_context():
        while True:
            try:
                db.engine.connect()
                break
            except Exception:
                sleep(2)
    app.register_blueprint(api_bp)
    return app