from models.member import Member





def verify_org_member(org_id, user_id):
    member = Member.query.filter_by(org_id=org_id, user_id=user_id).first()
    if member:
        return member
    return False

