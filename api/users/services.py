from models.user import User
from ..utils.responses import success, error
from models.member import Member
from models.invite import Invite
from models.image import Image
from flask import request
from ..utils.image_utils import save_img_upload
from extensions import db
import os


def user_service(username):
    if not username:
        return error(code="INVALID_DATA", message="username is required.")
    user = User.query.filter_by(username=username).first()
    if not user:
        return error(code="NOT_FOUND", message="user not found.", status=404)
    members_user = Member.query.filter_by(user_id=user.id).all()
    if members_user:
        orgs_user_is_member = [{
            "id": i.org.id,
            "name": i.org.name,
            "image_url": request.host_url+i.org.image.img_path if i.org.image else None
        } for i in members_user]
    else:
        orgs_user_is_member = None
    return success(
        data={
            "id": user.id,
            "username": user.username,
            "pfp_url": request.host_url+user.image.img_path if user.image else None,
            "created_at": user.created_at,
            "orgs_user_is_member": orgs_user_is_member
        }
    )

def invites_service(user_id):
    invites = Invite.query.filter_by(user_invited_id=user_id).all()
    invites_json = []
    for i in invites:
        invite = {
            "id":i.id,
            "member_id": i.member_id,
            "created_at": i.created_at,
            "member_username": i.member.user.username,
            "org_id": i.org_id,
            "org_name": i.org.name
        }
        invites_json.append(invite)
    return success(
         data=invites_json, status=200
    )

def edit_user_service(data, username, user_id):
    img = data.get("img")
    name = data.get("username")
    if not (img or name):
        return error("INVALID_DATA", message="img or name are required.")

    user = User.query.filter_by(username=username).first()
    if not user:
        return error(code="NOT_FOUND", message="user not found.", status=404)

    if user.id != user_id:
        return error(code="ACCESS_DENIED", message="only self-editing is allowed.", status=403)
    
    if img:
        response = save_img_upload(img, ["JPEG", "PNG", "GIF"])
        if response[0] == "error":
            return response[1]
        image_path = response[1]
        image = Image(img_path=image_path)
        user.image = image

    if name:
        user.username = name
    
    db.session.commit()
    return success(data={
        "id": user.id,
        "username": user.username,
        "pfp_url": request.host_url+user.image.img_path if user.image else None
    })

def remove_pfp_service(user_id):
    user = db.session.get(User, user_id)
    if not user.image:
        return error(code="NOT_FOUND", message="pfp not found.", status=404)
    
    if os.path.exists(user.image.img_path):
        os.remove(user.image.img_path)
    user.pfp_id = None
    db.session.delete(user.image)
    db.session.commit()
    return success(message="done.")
