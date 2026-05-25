from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone

class Organization(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(30), nullable=False, unique=True)
    description = db.Column(db.String(120), nullable=False)
    img_id = db.Column(UUID(as_uuid=True), db.ForeignKey("image.id"), unique=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    members = db.relationship("Member", back_populates="org")
    projects = db.relationship("Project", back_populates="org")
    image = db.relationship("Image")