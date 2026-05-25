from extensions import db
from sqlalchemy.dialects.postgresql import UUID
import uuid


class Image(db.Model):
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    img_path = db.Column(db.String(200), unique=True, nullable=False)

    