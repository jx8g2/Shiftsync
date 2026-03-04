# ShiftSync — Employee Scheduling & Management

A full-stack employee scheduling, shift-cover, time-off, messaging, and management system. Runs entirely via Docker with a PostgreSQL database and Redis cache.

---

## 📋 Prerequisites

| Requirement | Version |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest |
| [Docker Compose](https://docs.docker.com/compose/) | Included with Docker Desktop |

> No Node.js installation is required on your host machine. The Docker build handles everything.

---

## 🚀 Quick Start

### 1. Configure Your Environment

Open `docker-compose.yml` and update the following values before the **first** launch:

```yaml
environment:
  # ── Security (CHANGE THESE before first launch) ───────────────────────────
  JWT_SECRET: your-long-random-secret-here          # Used to sign auth tokens
  CHAT_ENCRYPTION_KEY: your-32-char-key-here!!      # Must be exactly 32 chars

  # ── Initial Admin Account (used only on first run) ────────────────────────
  ADMIN_USERNAME: admin
  ADMIN_EMAIL: admin@yourcompany.com
  ADMIN_PASSWORD: YourStrongPasswordHere
  ADMIN_NAME: System Admin
  ADMIN_PHONE: "(555) 555-0000"
```

> ⚠️ **Important:** Once the database is created, changing `ADMIN_EMAIL` / `ADMIN_PASSWORD` here has no effect. Use the app's employee management page to update credentials after first launch.

---

### 2. Start the Application

```bash
docker compose up --build -d
```

This will:
- Build the React frontend
- Start the Node.js backend (port 3000)
- Start PostgreSQL (port 5432)
- Start Redis (port 6379)
- Auto-migrate and seed the database on first run

### 3. Access the App

Open your browser and go to: **http://localhost:3000**

Log in with the admin credentials you set in `docker-compose.yml`.

---

## 🔄 Updating the App

When you receive updated source files, rebuild and restart:

```bash
docker compose down
docker compose up --build -d
```

> Your database data is preserved in the `postgres_data` Docker volume across restarts and rebuilds.

---

## 🛑 Stopping the App

```bash
# Stop containers (keeps data)
docker compose down

# Stop AND delete all data volumes (full reset)
docker compose down -v
```

---

## 👤 User Roles

| Role | Access |
|---|---|
| **Admin** | Full system access — stores, employees, schedules, settings |
| **Manager** | Their store — schedules, time-off approvals, shift cover approvals, employee management |
| **Shift Lead** | Their store — shift cover approvals only |
| **Employee** | Their own schedule, time-off requests, shift cover requests, messaging |

---

## 💾 Database Backups

### Automated Backups
1. Log in as **Admin**
2. Go to **Settings → Database Backups**
3. Set a backup interval (e.g., every 12 or 24 hours)
4. Backups are stored in the `backups/` folder on your host machine

### Manual Backup
- Click **"Backup Now"** from the Database Backups page

### Restore a Backup
- Click **"Restore"** next to any backup snapshot — this immediately overwrites the live database

> Backup files are stored at `./backups/` on your host, mounted as a Docker volume so they persist outside the container.

---

## 🔔 Notifications

The app supports **in-app** and **push notifications** (via browser Web Push API).

- Employees are notified when their time-off or shift cover requests are approved, denied, or when a **previous decision is changed** (the notification will say *"Decision changed to Approved/Denied by Manager/Shift Lead [Name]"*)
- Managers and Shift Leads are notified of new requests in real time via WebSocket

---

## 🧩 Architecture Overview

```
docker-compose.yml
│
├── app (Node.js + React)   → port 3000
│   ├── server/             Backend Express API + Socket.io
│   │   ├── routes/         API route handlers
│   │   ├── utils/          Socket, Redis, Push helpers
│   │   ├── services/       Backup service
│   │   └── db.js           PostgreSQL client + auto-migration
│   └── dist/               Built React frontend (served statically)
│
├── db (PostgreSQL 18.1)    → port 5432 (internal)
└── redis (Redis 7.4)       → port 6379 (internal)
```

---

## 🔒 Production Security Checklist

Before going live:

- [ ] Change `JWT_SECRET` to a long random string (e.g. `openssl rand -hex 64`)
- [ ] Change `CHAT_ENCRYPTION_KEY` to a secure 32-character string
- [ ] Set a strong `ADMIN_PASSWORD`
- [ ] Change default PostgreSQL password (`POSTGRES_PASSWORD`) in `docker-compose.yml`
- [ ] Do **not** expose ports `5432` or `6379` publicly — they are internal-only
- [ ] Set up a reverse proxy (e.g. nginx) with HTTPS/SSL in front of port `3000`
- [ ] Ensure `backups/` and Docker volume directories are secured on the host

---

## 📁 Folder Contents (Production Build)

```
scheduling app production/
├── server/                 ← Backend source (Express API)
│   ├── routes/             ← All API route files
│   ├── utils/              ← Socket, Redis, Push utilities
│   ├── services/           ← Backup service
│   ├── db.js               ← Database client + migrations
│   ├── index.js            ← Server entry point
│   ├── package.json
│   └── .env.example        ← Reference for local dev env vars
├── src/                    ← React frontend source
├── public/                 ← Static assets (PWA manifest, service worker)
├── backups/                ← Backup files stored here (Docker volume mount)
├── Dockerfile              ← Multi-stage build (frontend + backend)
├── docker-compose.yml      ← Run everything with one command
├── .dockerignore
├── package.json            ← Frontend dependencies
├── vite.config.js          ← Vite build config
├── index.html              ← Frontend entry HTML
└── README.md               ← This file
```

---

## 🛠️ Troubleshooting

**Containers not starting?**
```bash
docker compose logs app
docker compose logs db
```

**Database not initializing?**
- Make sure the `db` service is healthy before `app` starts (handled automatically by `depends_on` health checks)
- Try `docker compose down -v` then `docker compose up --build -d` for a clean start

**Port 3000 already in use?**
- Change the host port in `docker-compose.yml`: `"3001:3000"` to use port 3001 instead

**Push notifications not working?**
- Web Push requires HTTPS in production. Set up a reverse proxy with an SSL certificate.
