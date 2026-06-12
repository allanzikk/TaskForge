#!/bin/bash

echo "Aguardando banco..."
while ! flask db upgrade; do
    echo "Falhou, tentando de novo em 2s..."
    sleep 2
done

echo "Banco pronto, subindo servidor..."
gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 --bind 0.0.0.0:5000 wsgi:app