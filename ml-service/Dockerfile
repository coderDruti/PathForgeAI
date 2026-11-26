FROM python:3.12-slim

WORKDIR /app

# Install uv for fast, reproducible installs
COPY --from=ghcr.io/astral-sh/uv:0.6.6 /uv /usr/local/bin/uv

COPY pyproject.toml ./
RUN uv sync --no-dev

COPY data ./data
COPY app ./app
COPY eval ./eval

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
