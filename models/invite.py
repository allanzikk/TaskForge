from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone

class Invite(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id =  db.Column(UUID(as_uuid=True), db.ForeignKey("member.id"))
    user_invited_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user.id"))
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    member = db.relationship("Member")
    user_invited = db.relationship("User")
    org = db.relationship("Organization")

    __table_args__ = (db.UniqueConstraint("member_id", "org_id", "user_invited_id"),)