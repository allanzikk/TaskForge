from models.member import Member
from models.organization import Organization
from extensions import db



def verify_org_member(org_id, user_id):
    member = Member.query.filter_by(org_id=org_id, user_id=user_id).first()
    if member:
        return member
    return False

def get_org_by_id(org_id):
    org = db.session.get(Organization, org_id)
    return org