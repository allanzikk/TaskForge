from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone

class Message(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"), nullable=False)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("user.id"), nullable=False)
    content = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User")
    org = db.relationship("Organization", back_populates="messages")