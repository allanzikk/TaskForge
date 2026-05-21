from models.user import User
from ..utils.responses import success, error
from models.member import Member
from models.invite import Invite

def user_service(username):
    if not username:
        return error(code="INVALID_DATA", message="username is required.")
    user = User.query.filter_by(username=username).first()
    if not user:
        return error(code="NOT_FOUND", message="user not found.", status=404)
    orgs_user_is_member = [i.org for i in Member.query.filter_by(user_id=user.id).all()]

    if not user:
        return error("NOT_FOUND", "user not found.", status=404)
    
    return success(
        data={
            "username": user.username,
            "id": user.id,
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
            "member_username": i.member.user.username,
            "org_id": i.org_id,
            "org_name": i.org.name
        }
        invites_json.append(invite)
    return success(
         data=invites_json, status=200
    )