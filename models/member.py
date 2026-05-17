from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid

class Member(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user.id"))
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"))
    role = db.Column(db.String(6), nullable=False)

    user = db.relationship("User")
    org = db.relationship("Organization")

    __table_args__ = (db.UniqueConstraint("user_id", "org_id"),)