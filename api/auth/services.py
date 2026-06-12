from models.user import User
from extensions import db, bcrypt
from flask_jwt_extended import create_access_token, create_refresh_token
from ..utils.responses import error, success

def login_service(data):
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return {
            "error": {
                "code": "INVALID_DATA",
                "messsage": "username and password required."
            }
        }, 400
    user = User.query.with_entities(User.password_hash, User.id, User.username).filter_by(username=username).first()
    try:
        response = bcrypt.check_password_hash(user.password_hash, password)
    except AttributeError:
        response = None
    if user is None or not response:
        return {
            "error": {
                "code": "INVALID_DATA",
                "message": "invalid credentials."
            }
        }, 400
    token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    return {
        "data": {
            "access_token": token,
            "refresh_token": refresh_token,
            "user": {
                "id": user.id,
                "username": user.username
            }
        }
    }

def create_account_service(data):
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return error(code="INVALID_DATA", message="username and password are required.")
    if 30 < len(username):
        return error("INVALID_DATA", "username can't be longer than 30 characters.")
    if len(username) < 4:
        return error("INVALID_DATA", "username can't be shorter than 4 characters.")
    if len(password) > 72:
        return error("INVALID_DATA", "password can't be longer than 72 characters.")
    if len(password) < 8:
        return error("INVALID_DATA", "password can't be shorter than 8 characters.")

    username_exists = User.query.filter_by(username=username).first()
    if username_exists is not None:
        return error(code="CONFLICT", message="username already exists", status=409)
    
    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(username=username, password_hash=password_hash)
    db.session.add(user)
    db.session.commit()
    return {
        "message": "user created.",
        "data": {
            "id": user.id,
            "username": user.username
        }
    }, 201
