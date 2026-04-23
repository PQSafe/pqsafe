# PQSafe API Reference Server — multi-stage Dockerfile
# Stage 1: install dependencies into a venv
# Stage 2: copy venv + app into a slim runtime image

# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps needed to compile pqcrypto (libpqcrypto C library)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install --no-cache-dir ".[dev]" --target /build/deps

# ---- Runtime stage ----
FROM python:3.11-slim AS runtime

WORKDIR /app

# Create non-root user
RUN useradd --create-home --no-log-init --uid 1001 pqsafe

# Copy installed packages
COPY --from=builder /build/deps /usr/local/lib/python3.11/site-packages

# Copy application code
COPY app/ ./app/

# Switch to non-root
USER pqsafe

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run with uvicorn — 2 workers is safe for a single-process container
# Scale horizontally with multiple replicas, not more workers per container
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info", \
     "--access-log"]
