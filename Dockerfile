FROM debian:13-slim

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY target/release/final-api /usr/local/bin/final-api

EXPOSE 3000

CMD ["final-api"]
