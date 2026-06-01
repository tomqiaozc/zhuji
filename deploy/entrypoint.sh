#!/bin/sh
# Resolve ${BACKEND_URL} / ${PORT} in /etc/nginx/templates/*.template into
# /etc/nginx/conf.d/*.conf. nginx's default entrypoint already runs every
# script in /docker-entrypoint.d/, so we just leave a log line.
set -e
: "${BACKEND_URL:?BACKEND_URL must be set (e.g. https://app-backend-zhuji-prod.azurewebsites.net)}"
: "${PORT:=8080}"
export BACKEND_URL PORT
echo "[zhuji] reverse-proxy /api → $BACKEND_URL (listen :$PORT)"
