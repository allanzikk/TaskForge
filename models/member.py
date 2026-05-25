from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone

class Member(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user.id"))
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"), nullable=False)
    role = db.Column(db.String(6), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User")
    org = db.relationship("Organization", back_populates="members")

    __table_args__ = (db.UniqueConstraint("user_id", "org_id"),)