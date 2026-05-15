from app_factory import create_app
from extensions import db

app = create_app()

with app.app_context():
    db.create_all()

app.run(debug=True)