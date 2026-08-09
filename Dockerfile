FROM mcr.microsoft.com/devcontainers/base:1-bookworm

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    postgresql-client \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22（npmmirror 二进制镜像；不用 devcontainers node feature，避免其自带 eslint 扩展）
RUN curl -fsSL https://registry.npmmirror.com/-/binary/node/v22.17.0/node-v22.17.0-linux-x64.tar.gz \
    | tar -xz -C /usr/local --strip-components=1 \
    && npm config set registry https://registry.npmmirror.com -g

# Rust 1.97（USTC 镜像安装 rustup 并固定默认版本，rebuild 不回退）
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://mirrors.ustc.edu.cn/rust-static/rustup/dist/x86_64-unknown-linux-gnu/rustup-init -o /tmp/rustup-init \
    && chmod +x /tmp/rustup-init \
    && RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static \
       RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup \
       /tmp/rustup-init -y --default-toolchain 1.97.0 --profile minimal -c rustfmt -c clippy \
    && rm /tmp/rustup-init \
    && chmod -R a+w /usr/local/rustup /usr/local/cargo
