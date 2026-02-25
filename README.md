# ShiftSync Scheduling App

A comprehensive employee scheduling, communication, and management system.

## 📋 Prerequisites

*   **Docker** & **Docker Compose**: Required to run the application, PostgreSQL database, and Redis cache.

## 🚀 Quick Start (Docker)

The easiest way to run ShiftSync is using the provided Docker configuration.

1.  **Configure Environment Variables**
    Review the `docker-compose.yml` file in the root directory. You can adjust the default Admin account credentials passed as environment variables in the `app` service:
    * `ADMIN_USERNAME`
    * `ADMIN_EMAIL`
    * `ADMIN_PASSWORD`
    * `JWT_SECRET` (Change this for production!)

2.  **Start the Application**
    Run the following command in the root directory:
    ```bash
    docker compose up --build -d
    ```

3.  **Access the App**
    Open your browser and navigate to `http://localhost:3000`.

## 👤 Default Login (Admin)

When the database initializes for the first time, it will create a System Admin account using the credentials defined in `docker-compose.yml`:

*   **Email**: `admin@shiftsync.com` (default)
*   **Password**: `admin123` (default)

*Note: To change these after the database has already been created, you must either update the employee directly in the app or safely reset the database volume.*

## 💾 Database Backups

The system includes a built-in automated backup mechanism directly accessible via the Admin Dashboard.

### Configuration & Restoration
1. Log in as an Admin.
2. Navigate to **Database Backups** (`/admin/settings`) using the sidebar.
3. **Automated Schedule**: Configure the automated backup interval (e.g., Every 12 hours, 24 hours).
4. **Manual Backup**: Click "Backup Now" to trigger an immediate snapshot.
5. **Restoration**: Click "Restore" on any available backup to immediately overwrite the database with that snapshot.

*Backups are physically stored in the `backups/` directory on the host machine, mounted as a Docker volume.*

## 📦 Production Deployment

For a production environment, ensure you follow these security steps:

1.  **Security**:
    *   Change `JWT_SECRET` in `docker-compose.yml` to a long, random, secure string.
    *   Set a strong `ADMIN_PASSWORD` before the first launch.
2.  **Volumes**:
    *   Ensure the host directories mapped to the Docker volumes (`postgres_data`, `redis_data`, `backups`) are secure and monitored.
