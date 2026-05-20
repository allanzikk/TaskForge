from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid


class Task(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(30), nullable=False, unique=True)
    description = db.Column(db.String(200), nullable=False)
    project_id = db.Column(UUID(as_uuid=True), db.ForeignKey("project.id"), nullable=False)

    project = db.relationship("Project", back_populates="tasks")
