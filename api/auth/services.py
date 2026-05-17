from models.user import User
from extensions import db, bcrypt
from flask_jwt_extended import create_access_token


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
    response = bcrypt.check_password_hash(user.password_hash, password)
    if user is None or not response:
        return {
            "error": {
                "code": "INVALID_DATA",
                "message": "invalid credentials."
            }
        }, 400
    token = create_access_token(identity=user.id)
    return {
        "data": {
            "access_token": token,
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
        return {
            "error": {
                "code": "INVALID_DATA",
                "messsage": "username and password required."
            }
        }, 400
    
    username_exists = User.query.filter_by(username=username).first()
    if username_exists is not None:
        return {
            "error": {
                "code": "CONFLICT",
                "message": "username already exists."
            }
        }, 409
    
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
