# Google File System Based Collaborative Docs

This project implements a fault-tolerant, distributed document storage and editing system modeled after the Google File System (GFS) architecture. It demonstrates core distributed computing concepts including consistency models, leader election, and clock synchronization across a cluster of simulated nodes.

## Architecture

The system consists of three decoupled layers:

1.  **Storage Layer (Python):** A cluster of Master nodes (metadata/consensus) and Chunkservers (data storage).
2.  **Middleware (Bun):** An API gateway handling request routing, load balancing, and failover logic.
3.  **Client (React):** A user interface for document management and system administration.

## Features

*   **Bully Election Algorithm:** Automatic leader election and recovery for Master nodes.
*   **Berkeley Algorithm:** Physical clock synchronization across storage nodes.
*   **GFS Consistency:** Lease-based primary-backup replication with a two-phase commit pipeline.
*   **Fault Tolerance:** Automated detection of node failures with read/write redirection.
*   **Admin Console:** Real-time telemetry visualization and fault injection capabilities.

## Prerequisites

*   **Python 3.11+** (managed via `uv`)
*   **Bun 1.0+**

## Installation and Startup

Run the components in the following order to ensure proper service discovery.

### 1. Backend Cluster

The backend simulates the distributed nodes (Masters and Chunkservers).

Navigate to the backend directory:
```bash
cd backend
```

Install dependencies:
```bash
uv sync
```

Start the cluster manager:
```bash
uv run start_cluster.py
```
*The cluster manager will spawn 3 Master processes and 4 Chunkserver processes. Logs are written to the `logs/` directory.*

### 2. Middleware

The middleware acts as the bridge between the frontend and the backend cluster.

Navigate to the middleware directory:
```bash
cd middleware
```

Install dependencies:
```bash
bun install
```

Start the gateway:
```bash
bun run index.ts
```
*The middleware listens on port 3000.*

### 3. Frontend

The user interface for editing documents and monitoring the system.

Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
bun install
```

Start the development server:
```bash
bun run dev
```

## Usage

### User Interface
Access the application at `http://localhost:5173`.
1.  Register a new account.
2.  Create documents (triggers GFS allocation).
3.  Share document IDs with other users to test access control lists (ACLs).

### Admin Console
Access the system internals at `http://localhost:5173/admin`.
*   **Control Plane:** View Master node status and election states.
*   **Data Plane:** Monitor Chunkserver clock offsets and request loads.
*   **Fault Injection:** Manually stop nodes to observe failover algorithms in real-time.
