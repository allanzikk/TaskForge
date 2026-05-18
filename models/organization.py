from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid

class Organization(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(30), nullable=False, unique=True)

    members = db.relationship("Member", back_populates="org")
    projects = db.relationship("Project", back_populates="org")