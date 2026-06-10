#!/bin/bash

echo "Aguardando banco..."
while ! flask db upgrade 2>/dev/null; do
    sleep 2
done

echo "Banco pronto, subindo servidor..."
gunicorn --worker-class gevent -w 1 --bind 0.0.0.0:5000 wsgi:app