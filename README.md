# ShiftSync Scheduling App

A comprehensive employee scheduling and management system.

## 📋 Prerequisites

Before running the application, ensure you have the following installed:

*   **Node.js**: Version 23.0.0 or higher.
*   **Docker Desktop**: To run the PostgreSQL database.

## 🚀 Quick Start (Development)

1.  **Install Dependencies**
    Run the following command in the root directory to install dependencies for both the frontend and backend:
    ```bash
    npm install
    cd server && npm install && cd ..
    ```

2.  **Start the Database**
    The application uses PostgreSQL running in a Docker container.
    ```bash
    cd scripts
    docker compose up -d
    cd ..
    ```

3.  **Configure Environment**
    Ensure the `server/.env` file exists with the following content (update keys for production!):
    ```env
    DATABASE_URL=postgresql://postgres:password@localhost:5432/shiftsync
    PORT=3001
    NODE_ENV=development
    JWT_SECRET=your_secure_jwt_secret_here    <-- CHANGE THIS IN PRODUCTION
    CHAT_ENCRYPTION_KEY=shiftsync-chat-key-32chars!! <-- CHANGE THIS IN PRODUCTION (Must be 32 chars)
    ```

4.  **Start the Application**
    You can start both the backend and frontend using the provided script (Windows):
    ```powershell
    .\start-dev.bat
    ```
    
    Or manually:
    *   **Backend**: `cd server && npm run dev`
    *   **Frontend**: `npm run dev`

## 👤 Default Login (Admin)

When the application starts for the first time with a fresh database, it will create a default **System Admin** account.

*   **Email**: `admin@shiftsync.com`
*   **Password**: `admin123` (or configured via environment variables)

### Changing Default Credentials
To change the initial admin credentials for a new deployment:
1.  Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, etc. in your environment variables.
2.  Reset the database (delete the Docker volume).
3.  Restart the server.

## � Database Backups

The system includes a built-in backup mechanism.

### Automated Backups
*   **Schedule**: Runs automatically every day at midnight (00:00).
*   **Rotation**: Stores the last 7 daily backups.
*   **Location**: `backups/` folder in the root directory.

### Manual Backup
To trigger a backup manually immediately:
1.  Navigate to `scripts/`.
2.  Run `manual-backup.bat`.

### Restoring a Backup
To restore data from a SQL file:
```bash
# WARNING: This overwrites current data!
type ..\backups\your-backup-file.sql | docker exec -i shiftsync_postgres psql -U postgres -d shiftsync
```

## �📦 Production Deployment

For a production environment, follow these additional steps:

1.  **Security**:
    *   Change `JWT_SECRET` in `server/.env` to a long, random string.
    *   Change `CHAT_ENCRYPTION_KEY` in `server/.env` to a *new* 32-character string.
    *   Update `scripts/admin-credentials.json` with a strong password before initial deployment.

2.  **Database**:
    *   Ensure the Docker volume `postgres_data` is backed up regularly.
    *   Alternatively, point `DATABASE_URL` to a managed PostgreSQL service (e.g., AWS RDS, Heroku Postgres).

3.  **Frontend Build**:
    *   Run `npm run build` to create static assets in `dist/`.
    *   The backend is configured to serve these static files automatically via `server/index.js`.
    
4.  **Process Management**:
    *   Use a process manager like PM2 to run the server:
        ```bash
        npm install -g pm2
        cd server
        pm2 start index.js --name "shiftsync-server"
        ```

## 🛠 Troubleshooting

*   **Database Connection Error**: Ensure Docker Desktop is running and the container is up (`docker ps`).
*   **Login Failed**: Check if the default password matches `scripts/admin-credentials.json`. If the database was already created with old credentials, you may need to reset it:
    ```bash
    cd scripts
    docker compose down -v
    docker compose up -d
    ```
