.PHONY: dev build run migrate migrate-revert frontend-dev frontend-build frontend-install clean

dev:
	cargo watch -x run

build:
	cargo build --release

run:
	cargo run

migrate:
	sqlx migrate run

migrate-revert:
	sqlx migrate revert

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-install:
	cd frontend && npm install

clean:
	cargo clean
	rm -rf frontend/dist frontend/node_modules
