from flask_socketio import emit, join_room
from extensions import db, socketio
from models.message import Message
from models.user import User
from models.organization import Organization
from flask_jwt_extended import decode_token
import uuid
from ..utils.org_utils import verify_org_member
from flask import request
from sqlalchemy.orm import joinedload


@socketio.on("join_org_chat")
def handle_join(data):
    access_token = data.get("access_token")
    try:
        token_info = decode_token(access_token)
        user_id = uuid.UUID(token_info["sub"])
    except Exception:
        emit('error', {'code': 'UNAUTHORIZED', 'message': 'invalid token.'})
        return

    org_id = data.get('org_id')
    if not org_id:
        emit('error', {'code': 'BAD_REQUEST', 'message': 'org_id is required.'})
        return
    
    org_id = uuid.UUID(org_id)
    
    member = verify_org_member(org_id, user_id)
    if not member:
        emit('error', {'code': 'ACCESS_DENIED', 'message': 'you are not a member of this organization.'})
        return
    
    join_room(str(org_id))

    messages = Message.query.filter_by(org_id=org_id)\
        .options(joinedload(Message.user).joinedload(User.image))\
        .order_by(Message.created_at.asc())\
        .limit(50)\
        .all()
    
    emit('chat_history', {'messages': [
        {
            'id': str(m.id),
            'user_id': str(m.user_id),
            'username': m.user.username,
            "pfp_url": request.host_url+messages.user.image.img_path if m.user.image else None,
            'content': m.content,
            'created_at': m.created_at.isoformat()
        } for m in messages
    ]})

@socketio.on("send_message")
def handle_message(data):
    access_token = data.get("access_token")
    try:
        token_info = decode_token(access_token)
        user_id = uuid.UUID(token_info["sub"])
    except Exception:
        emit('error', {'code': 'UNAUTHORIZED', 'message': 'invalid token.'})
        return
    
    org_id = data.get("org_id")
    if not org_id:
        emit('error', {'code': 'BAD_REQUEST', 'message': 'org_id is required.'})
        return
    org_id = uuid.UUID(org_id)
    
    member = verify_org_member(org_id, user_id)
    if not member:
        emit('error', {'code': 'ACCESS_DENIED', 'message': 'you are not a member of this organization.'})
        return
    
    content = data.get("content")
    if not content:
        emit('error', {'code': 'BAD_REQUEST', 'message': 'content is required.'})
        return
    
    if len(content) > 1000:
        emit('error', {'code': 'BAD_REQUEST', 'message': "content can't be longer than 1000 characters."})
        return
    
    user = User.query.options(joinedload(User.image)).get(user_id)
    org = db.session.get(Organization, org_id)

    message = Message(content=content, user=user, org=org)
    db.session.add(message)
    db.session.commit()
    
    emit('new_message', {
        'id': str(message.id),
        'user_id': str(message.user_id),
        'username': user.username,
        "pfp_url": request.host_url+user.image.img_path if user.image else None,
        'content': message.content,
        'created_at': message.created_at.isoformat()
    }, room=str(org_id))
