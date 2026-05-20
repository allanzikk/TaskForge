from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid


class Project(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(30), nullable=False)
    org_id = db.Column(UUID(as_uuid=True), db.ForeignKey("organization.id"), nullable=False)

    org = db.relationship("Organization", back_populates="projects")
    tasks = db.relationship("Task", back_populates="project")