#!/bin/bash
# Post-merge setup: install dependencies and push DB schema
set -e

echo "Installing dependencies..."
pnpm install

echo "Pushing database schema..."
pnpm run db:push

echo "Setup complete."
