from extensions import db
import uuid
from sqlalchemy.dialects.postgresql import UUID

class User(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username =  db.Column(db.String(20), nullable=False, unique=True)
    password_hash = db.Column(db.String(120), nullable=False)