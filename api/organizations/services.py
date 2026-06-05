from models.organization import Organization
import uuid
from models.member import Member
from models.user import User
from extensions import db
from ..utils.org_utils import verify_org_member, get_org_by_id
from ..utils.responses import error, success
from models.invite import Invite
from ..utils.image_utils import save_img_upload
from models.image import Image
from flask import request
import os

def organizations_service(user_id):
    members = Member.query.filter_by(user_id=user_id).all()
    if members:
        organizations_json = []
        for i in members:
            organization = {
                "id": i.org.id,
                "name": i.org.name,
                "description": i.org.description,
                "image_url": request.host_url+i.org.image.img_path if i.org.image else None,
            }
            organizations_json.append(organization)
    else:
        organizations_json = []
    return success(data=organizations_json)

def create_organization_service(data, owner_id):
    name = data.get("name")
    description = data.get("description")
    if not (name and description):
        return error(code="INVALID_DATA", message="name and description are required.")
    if not 3 <= len(name) <=30:
        return error("INVALID_DATA", "name out of limit (3-30).")
    if not 3 <= len(description) <= 120:
        return error("INVALID_DATA", "description out of limit (3-120).")


    user = db.session.get(User, owner_id)
    exists = Organization.query.filter_by(name=name).first()
    if exists is not None:
        return error(code="CONFLICT", message="org already exists.", status=409)

    img = data.get("img")
    if img:
        response = save_img_upload(img, ["JPEG", "PNG"])
        if response[0] == "error":
            return response[1]
        img_path = response[1]
        image = Image(img_path=img_path)
        db.session.flush()
    else:
        image = None

    org = Organization(name=name, description=description, image=image)
    db.session.add(org)
    db.session.flush()
    owner = Member(user=user, org=org, role="owner")
    db.session.add(owner)
    db.session.commit()
    return success(
        data= {
            "org_id": org.id,
            "org_name": org.name,
            "description": org.description,
            "image_url":request.host_url+org.image.img_path if org.image else None,
            "created_at": org.created_at,
            "owner_id": owner.user_id
        }, status=201
    )

def organization_service(org_id):
    org = db.session.get(Organization, org_id)
    if org is None:
        return error("NOT_FOUND", "org not found.", 404)
    members = Member.query.filter_by(org_id=org_id).all()
    members_json = []
    for i in members:
        member = {
            "user_id": str(i.user_id),
            "username": i.user.username,
            "pfp_url": request.host_url+i.user.image.img_path if i.user.image else None,
            "role": i.role
        }
        members_json.append(member)
    projects = []
    for i in org.projects:
        project = {
            "id": i.id,
            "name": i.name,
            "created_at": i.created_at,
            "progress": round(i.tasks_completed / len(i.tasks) * 100, 1) if i.tasks else 0
        }
        projects.append(project)

    return success(
        data={
            "id": org.id,
            "name": org.name,
            "description": org.description,
            "image_url": request.host_url+org.image.img_path if org.image else None,
            "created_at": org.created_at,
            "members": members_json,
            "projects": projects
        }
    )

def remove_organization_service(org_id, user_id):
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role != "owner":
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner.",
                    status=403)

    org = db.session.get(Organization, org_id)
    if org is None:
        return error(code="NOT_FOUND", message="org not found.", status=404)
    
    for i in org.members:
        db.session.delete(i)
    try:
        if os.path.exists(org.image.img_path):
            os.remove(org.image.img_path)
        db.session.delete(org.image)
    except AttributeError:
        pass
    db.session.delete(org)
    db.session.commit()
    return success(message="org deleted.")

def invite_service(user_invited_id, org_id, user_id):
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)
    
    user_is_already_member = verify_org_member(org_id, user_invited_id)
    if user_is_already_member:
        return error(code="CONFLICT", message="user is already a member.", status=409)

    invite_exists = Invite.query.filter_by(member_id=member.id, user_invited_id=user_invited_id).first()
    if invite_exists:
        return error(code="CONFLICT", message="user already invited.", status=409)
    
    user_invited = db.session.get(User, user_invited_id)

    invite = Invite(member=member, org=member.org, user_invited=user_invited)
    db.session.add(invite)
    db.session.commit()
    return success(
        data={
            "invite_id": invite.id,
            "created_at": invite.created_at,
            "member_id": member.id,
            "org_id": member.org_id,
            "user_invited_id": user_invited.id
        },
        message="created.", status= 201
    )

def accept_invite_service(invite_id, user_id):
    invite = db.session.get(Invite, invite_id)
    if invite.user_invited_id != user_id:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this invite.",
            status=403)
    
    member = Member(user=invite.user_invited, org=invite.org, role="member")
    db.session.add(member)
    db.session.delete(invite)
    db.session.commit()
    return success(
        data={
            "user_id": member.user_id,
            "role": member.role,
            "org_id": member.org_id
        }, message="created.", status= 201
    )

def members_service(org_id, user_id):
    org = db.session.get(Organization, org_id)
    if org is None:
        return error(code="NOT_FOUND", message="org not found.", status=404)
    
    is_member = verify_org_member(org_id, user_id)
    if not is_member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)

    members = []
    for i in org.members:
        member = {
            "member_id": i.id,
            "username": i.user.username,
            "pfp_url": request.host_url+i.user.image.img_path if i.user.image else None,
            "user_id": i.user_id,
            "role": i.role,
            "created_at": i.created_at
        }
        members.append(member)

    return success(data=members)

def member_service(member_id):
    member = db.session.get(Member, member_id)
    if not member:
        return error(code="NOT_FOUND", message="member not found.", status=404)
    return success(data={
        "user_id":member.user_id,
        "username": member.user.username,
        "pfp_url": request.host_url+member.user.image.img_path if member.user.image else None,
        "role": member.role,
        "joined_at": member.created_at,
        "org_id": member.org_id,
        "org_image_url": request.host_url+member.org.image.img_path if member.org.image else None,
        "org_name": member.org.name
    })

def edit_member_service(data, member_id, user_id):
    role = data.get("role")
    if not role:
        return error(code="INVALID_DATA", message="role is required.")

    if role not in ["member", "admin", "owner"]:
        return error(code="INVALID_DATA", message="role is not in the allowed formats ('member', 'admin', 'owner').")

    member = db.session.get(Member, member_id)
    if not member:
        return error(code="NOT_FOUND", message="member not found.", status=404)
    
    if member.role == "owner":
        return error(code="INSUFFICIENT_PERMISSION",
                    message="owner can't be edited.",
                    status=403)
    
    member_editor = verify_org_member(member.org_id, user_id)
    if not member_editor:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)
    
    if member_editor.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)
    
    member.role = role
    db.session.commit()
    return success(data={
        "user_id":member.user_id,
        "username": member.user.username,
        "role": member.role,
        "joined_at": member.created_at,
        "org_id": member.org_id,
        "org_name": member.org.name
    })

def edit_org_service(data, org_id, user_id):
    org = get_org_by_id(org_id)
    if org is None:
        return error(code="NOT_FOUND", message="org not found.", status=404)
    
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)

    img = data.get("img")
    name = data.get("name")
    description = data.get("description")
    if not (img or name or description):
        return error("INVALID_DATA", message="img, name or description are required.")
    
    if img:
        response = save_img_upload(img, ["JPEG", "PNG"])
        if response[0] == "error":
            return response[1]
        
        img_path = response[1]
        image = Image(img_path=img_path)
        db.session.add(image)
        db.session.flush()
        org.image = image

    if name:
        org.name = name

    if description:
        org.description = description
    
    db.session.commit()
    return success(data={
        "id": org.id,
        "name": org.name,
        "description": org.description,
        "image_url": request.host_url+org.image.img_path if org.image else None,
        "created_at": org.created_at
    })

def remove_img_service(org_id, user_id):
    org = db.session.get(Organization, org_id)
    if not org:
        return error(code="NOT_FOUND", message="org not found.", status=404)

    if not org.image:
        return error(code="NOT_FOUND", message="img not found.", status=404)

    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)
    
    if os.path.exists(org.image.img_path):
        os.remove(org.image.img_path)

    org.img_id = None
    db.session.delete(org.image)
    db.session.commit()
    
    return success(message="done.")

def leave_org_service(org_id, user_id):
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)
    
    if member.role == "owner":
        return error(code="INSUFFICIENT_PERMISSION",
                    message="owner can't leave org.",
                    status=403)
    
    db.session.delete(member)
    db.session.commit()
    return success(message="done.")

def reject_invite_service(invite_id, user_id):
    invite = db.session.get(Invite, invite_id)
    if not invite:
        return error(code="NOT_FOUND", message="invite not found", status=404)
    
    if invite.user_invited_id != user_id:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this invite.",
            status=403)
    
    db.session.delete(invite)
    db.session.commit()
    return success(message="done.")

def transfer_ownership_service(data, org_id, user_id):
    new_owner_id = data.get("new_owner_id")
    if not new_owner_id:
        return error(code="BAD_REQUEST", message="new_owner_id is required.")
    
    if new_owner_id == user_id:
        return error(code="BAD_REQUEST", message="self transfering ownership is not allowed.")

    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ACCESS_DENIED",
            message="user doesnt have access to this org.",
            status=403)
    
    if member.role != "owner":
        return error(code="INSUFFICIENT_PERMISSION",
                    message="only owner can transfer ownership.",
                    status=403)
    
    new_owner = Member.query.with_entities(Member.role).filter_by(user_id=new_owner_id).first()
    new_owner.role = "owner"
    member.role = "admin"
    db.session.commit()
    return success(data={
        "user_id":member.user_id,
        "username": member.user.username,
        "role": member.role,
        "joined_at": member.created_at,
        "org_id": member.org_id,
        "org_name": member.org.name
    })

def search_organization_service(user_id, name):
    if not name:
        return error(code="BAD_REQUEST", message="name can't be empty.")

    members_user = Member.query.join(Member.org).filter(Member.user_id == user_id, Organization.name.ilike(f"%{name}%")).limit(10).all()
    orgs_json = []
    for i in members_user:
        orgs_json.append({
            "id": i.org_id,
            "name": i.org.name,
            "image_url": request.host_url+i.org.image.img_path if i.org.image else None
        })
    return success(data=orgs_json)