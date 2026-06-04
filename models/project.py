from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone

class Project(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(30), nullable=False)
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    tasks_completed = db.Column(db.Integer, default=0)

    org = db.relationship("Organization", back_populates="projects")
    tasks = db.relationship("Task", back_populates="project", cascade="all, delete-orphan")