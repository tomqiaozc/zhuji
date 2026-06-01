# ── Build stage ──
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src/ src/
RUN pip install --no-cache-dir --prefix=/install .

# ── Runtime stage ──
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

COPY alembic.ini .
COPY alembic/ alembic/
COPY src/ src/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

CMD ["sh", "entrypoint.sh"]
