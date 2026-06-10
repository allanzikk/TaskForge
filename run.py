from gevent import monkey
monkey.patch_all()
from extensions import socketio

from app_factory import create_app


app = create_app()
if __name__ == "__main__":
    socketio.run(app, debug=True)