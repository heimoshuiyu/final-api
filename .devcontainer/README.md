# Dev Container

## Podman setup

This devcontainer is configured for **Podman rootless** as the container engine.

### 1. VS Code settings

Add to your `settings.json` (User or Workspace):

```json
{
    "dev.containers.dockerPath": "podman",
    "dev.containers.dockerComposePath": "podman-compose"
}
```

### 2. Install podman-compose

```bash
pip install podman-compose
# or
dnf install podman-compose   # Fedora/RHEL
```

### 3. Enable user lingering

So rootless containers survive logout:

```bash
loginctl enable-linger $USER
```

### 4. userns mapping

Dev Containers extension >= 0.416.0 auto-sets `PODMAN_USERNS=keep-id`,
which maps the container user UID to your host UID (fixes bind-mount permissions).

If using an older extension, add to `runArgs` in `devcontainer.json`:

```json
"runArgs": ["--userns=keep-id"]
```

### 5. SELinux

`devcontainer.json` includes `"securityOpt": ["label=disable"]` to avoid
SELinux label issues on bind mounts (Fedora/RHEL). This is harmless on
non-SELinux systems.

## Database connection

The app connects to PostgreSQL via `db:5432` (Docker Compose service name DNS),
injected through `containerEnv.DATABASE_URL` in `devcontainer.json`.
