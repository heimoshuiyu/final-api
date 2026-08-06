#!/bin/bash
set -e

cd /workspace

# Install Rust dev tools (cached in cargo-registry volume after first run)
if ! command -v sqlx &>/dev/null; then
    echo ">>> Installing sqlx-cli (~2 min, one-time)..."
    cargo install sqlx-cli --locked --version 0.8.6 --no-default-features --features rustls,postgres
fi

if ! command -v cargo-watch &>/dev/null; then
    echo ">>> Installing cargo-watch (~1 min, one-time)..."
    cargo install cargo-watch --locked
fi

echo ">>> Installing frontend dependencies..."
cd frontend && npm install && cd ..

if [ ! -f .env ]; then
    cp .env.example .env
fi

echo ">>> Running database migrations..."
sqlx migrate run || echo "WARNING: Migration failed — check DATABASE_URL and PostgreSQL health"

echo "=== Setup complete! ==="
