from models.organization import Organization
import uuid
from models.member import Member
from models.user import User
from extensions import db
from ..utils.org_utils import verify_org_member
from ..utils.responses import error, success
from models.invite import Invite

def organizations_service():
    organizations = Organization.query.all()
    organizations_json = []
    for i in organizations:
        organization = {
            "id": i.id,
            "name": i.name
        }
        organizations_json.append(organization)
    return organizations_json, 200

def create_organization_service(data, owner_id):
    user = db.session.get(User, uuid.UUID(owner_id))
    name = data.get("name")
    if not name:
        return {
        "error": {
            "code": "INVALID_DATA",
            "message": "name is required."
        }
    }, 400
    exists = Organization.query.filter_by(name=name).first()
    if exists is not None:
        return {
        "error": {
            "code": "CONFLICT",
            "message": "organization already exists."
        }
    }, 409

    org = Organization(name=name)
    db.session.add(org)
    db.session.flush()
    owner = Member(user=user, org=org, role="owner")
    db.session.add(owner)
    db.session.commit()
    return {
        "data": {
            "org_id": org.id,
            "org_name": org.name,
            "owner_id": owner.user_id
        }
    }, 201

def organization_service(org_id):
    org_id = uuid.UUID(org_id)
    org = db.session.get(Organization, org_id)
    if org is None:
        return {
            "error": {
                "code": "NOT_FOUND",
                "message": "organization not found."
            }
        }, 404
    members = Member.query.filter_by(org_id=org_id).all()
    members_json = []
    for i in members:
        member = {
            "user_id": str(i.user_id),
            "username": i.user.username,
            "role": i.role
        }
        members_json.append(member)
    print(members_json)
    return {
        "data": {
            "name": org.name,
            "id": str(org.id),
            "members": members_json
        }
    }, 200

def remove_organization_service(org_id):
    org = db.session.get(Organization, org_id)
    db.session.delete(org)
    db.session.commit()
    return {
        "message": "removed."
    }, 200

def invite_service(user_invited_id, org_id, user_id):
    member = verify_org_member(org_id, user_id)
    if not member:
        return error(
            code="ORGANIZATION_ACCESS_DENIED",
            message="user doesnt have access to this organization.",
            status=403)
    
    if member.role not in ["owner", "admin"]:
        return error(code="INSUFFICIENT_PERMISSION",
                    message="user needs to be owner or admin.",
                    status=403)
    
    
    user_invited = db.session.get(User, user_invited_id)

    invite = Invite(member=member, org=member.org, user_invited=user_invited)
    db.session.add(invite)
    db.session.commit()
    return success(
        data={
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
            code="INVITE_ACCESS_DENIED",
            message="user doesnt have access to this invite.",
            status=403)
    
    member = Member(user=invite.user_invited, org=invite.org, role="member")
    db.session.add(member)
    db.session.commit()
    return success(
        data={
            "user_id": member.user_id,
            "role": member.role,
            "org_id": member.org_id
        }, message="created.", status= 201
    )