import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const CLUSTER_MANAGER = "http://localhost:8000";

// Default configuration (can be updated via Cluster Manager)
let MASTER_PORTS = [6001, 6002, 6003];

let currentLeader: number | null = null;

// --- HELPER: Leader Discovery & Request Forwarding ---

async function getLeaderUrl(): Promise<string> {
    if (currentLeader) return `http://localhost:${currentLeader}`;
    
    console.log("[MW] Scanning for Leader...");
    // Poll masters to find the active leader
    for (const port of MASTER_PORTS) {
        try {
            const res = await axios.get(`http://localhost:${port}/health`, { timeout: 800 });
            if (res.data.role === "leader") {
                console.log(`[MW] Found Leader: Node ${port}`);
                currentLeader = port;
                return `http://localhost:${port}`;
            }
        } catch (e) {
            // Node dead or not responding, continue scan
        }
    }
    throw new Error("No Leader Found in Cluster");
}

/**
 * robustRequest: Wraps requests to the Master node with automatic failover.
 * If the cached leader is dead, it rescans and retries the request once.
 */
async function forwardToLeader(method: 'get' | 'post', path: string, data: any = {}) {
    const makeRequest = async (url: string) => {
        if (method === 'get') return axios.get(`${url}${path}`);
        return axios.post(`${url}${path}`, data);
    };

    try {
        const leaderUrl = await getLeaderUrl();
        return await makeRequest(leaderUrl);
    } catch (error: any) {
        console.warn(`[MW] Request to leader failed: ${error.message}. Triggering Failover...`);
        
        // Invalidate cache
        currentLeader = null;
        
        // Wait briefly for a new election to potentially resolve
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Retry once
        try {
            const newLeaderUrl = await getLeaderUrl();
            return await makeRequest(newLeaderUrl);
        } catch (retryError: any) {
            console.error("[MW] Failover failed.");
            throw retryError; // Propagate error to caller
        }
    }
}

// ==========================================
// ADMIN & VISUALIZATION ROUTES
// ==========================================

app.get("/api/admin/cluster-status", async (req, res) => {
    try {
        // 1. Physical Status from Cluster Manager
        const managerRes = await axios.get(`${CLUSTER_MANAGER}/manager/status`);
        const physicalStatus = managerRes.data;

        const masters = [];
        const chunkservers = [];
        
        // Hardcoded chunk ports for monitoring logic (can be improved by fetching from Manager)
        const CHUNK_PORTS = [5001, 5002, 5003, 5004];

        // 2. Logical Status (Masters)
        for (const port of MASTER_PORTS) {
            const status = physicalStatus[port] || "STOPPED";
            if (status === "RUNNING") {
                try {
                    const r = await axios.get(`http://localhost:${port}/system/status`, { timeout: 1000 });
                    masters.push({ ...r.data, status: "RUNNING" });
                } catch {
                    masters.push({ node_id: port, status: "UNREACHABLE" });
                }
            } else {
                masters.push({ node_id: port, status: "STOPPED" });
            }
        }

        // 3. Logical Status (Chunkservers)
        for (const port of CHUNK_PORTS) {
            const status = physicalStatus[port] || "STOPPED";
            if (status === "RUNNING") {
                try {
                    const r = await axios.get(`http://localhost:${port}/admin/status`, { timeout: 1000 });
                    chunkservers.push({ ...r.data, status: "RUNNING" });
                } catch {
                    chunkservers.push({ port: port, status: "UNREACHABLE" });
                }
            } else {
                chunkservers.push({ port: port, status: "STOPPED" });
            }
        }

        res.json({ masters, chunkservers, current_leader: currentLeader });

    } catch (e) {
        res.status(500).json({ error: "Cluster Manager Unavailable" });
    }
});

app.post("/api/admin/node/:action/:port", async (req, res) => {
    const { action, port } = req.params;
    try {
        await axios.post(`${CLUSTER_MANAGER}/manager/${action}/${port}`);
        // If we stopped the leader, force re-discovery immediately
        if (action === 'stop' && parseInt(port) === currentLeader) {
            console.log("[MW] Leader killed by Admin. Resetting cache.");
            currentLeader = null;
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Control failed" });
    }
});

// ==========================================
// AUTHENTICATION
// ==========================================

app.post("/api/auth/register", async (req, res) => {
    try {
        const r = await forwardToLeader('post', '/auth/register', req.body);
        res.json(r.data);
    } catch (e: any) {
        res.status(e.response?.status || 500).json({error: "Registration Failed"});
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const r = await forwardToLeader('post', '/auth/login', req.body);
        res.json(r.data);
    } catch (e: any) {
        res.status(401).json({error: "Invalid Credentials"});
    }
});

// ==========================================
// DOCUMENT MANAGEMENT
// ==========================================

// Helper: The GFS Write Pipeline (Stage -> Commit)
async function performWritePipeline(chunk_handle: string, content: string, replicas: number[], primary: number) {
    console.log(`[MW] Write Pipeline: ${chunk_handle} -> [${replicas}] (Pri: ${primary})`);
    
    // 1. Stage Data (Fan-out)
    const stagePromises = replicas.map((port) => 
        axios.post(`http://localhost:${port}/chunk/stage`, { handle: chunk_handle, content }, { timeout: 2000 })
            .then(() => ({ status: 'fulfilled', port }))
            .catch((e) => ({ status: 'rejected', port, error: e.message }))
    );

    const results = await Promise.all(stagePromises);
    const successfulPorts = results.filter((r: any) => r.status === 'fulfilled').map((r: any) => r.port);

    // Integrity Checks
    if (successfulPorts.length === 0) throw new Error("Write Failed: All replicas failed to stage data.");
    
    // If primary failed to stage, we cannot commit.
    if (!successfulPorts.includes(primary)) {
        // In a real GFS, we would re-request a new lease/primary here. 
        // For simplicity, we fail and let the client retry.
        throw new Error("Write Failed: Primary replica failed to stage data.");
    }

    // 2. Commit (Primary coordinates replication to secondaries)
    // We only tell the primary to replicate to nodes that successfully staged the data
    const secondaries = successfulPorts.filter((p: number) => p !== primary);
    
    await axios.post(`http://localhost:${primary}/chunk/commit`, {
        handle: chunk_handle,
        secondaries: secondaries
    });
}

app.get("/api/docs/list/:userId", async (req, res) => {
    try {
        const r = await forwardToLeader('get', `/file/list/${req.params.userId}`);
        res.json(r.data);
    } catch (e) {
        res.status(500).json({ error: "Fetch Failed" });
    }
});

app.post("/api/docs/create", async (req, res) => {
    const { filename, content, user_id } = req.body;
    try {
        // 1. Metadata (Create entry on Leader)
        const masterRes = await forwardToLeader('post', '/file/create', { filename, user_id });
        const { file_id, chunk_handle, replicas, primary } = masterRes.data;

        // 2. Data (Push to Chunkservers)
        try {
            await performWritePipeline(chunk_handle, content, replicas, primary);
        } catch (writeError: any) {
            console.error("[MW] Data write failed:", writeError.message);
            // Note: File metadata exists but data is missing. 
            // A garbage collector would clean this up in real GFS.
            return res.status(500).json({ error: "File created but data write failed. Please retry." });
        }

        res.json({ success: true, file_id });
    } catch (error: any) {
        console.error("Create Error:", error.message);
        res.status(error.response?.status || 500).json({ error: "Create Failed" });
    }
});

app.post("/api/docs/update", async (req, res) => {
    const { file_id, content, user_id } = req.body;
    try {
        // 1. Lookup (Check Perms + Get Locations)
        const lookup = await forwardToLeader('post', `/file/lookup/${file_id}`, { user_id });
        const targetChunk = lookup.data.chunks[0];

        // 2. Write
        await performWritePipeline(targetChunk.handle, content, targetChunk.replicas, targetChunk.primary);

        res.json({ success: true });
    } catch (error: any) {
        if (error.response?.status === 403) return res.status(403).json({ error: "Denied" });
        console.error("Update Error:", error.message);
        res.status(500).json({ error: "Update Failed" });
    }
});

app.post("/api/docs/read/:fileId", async (req, res) => {
    try {
        // 1. Get Metadata from Leader
        const lookup = await forwardToLeader('post', `/file/lookup/${req.params.fileId}`, { user_id: req.body.user_id });
        const targetChunk = lookup.data.chunks[0];

        // 2. Read from Replicas (Load Balancing)
        // Try primary first for consistency, then secondaries
        const readOrder = [targetChunk.primary, ...targetChunk.replicas.filter((p:number) => p !== targetChunk.primary)];
        
        for (const port of readOrder) {
            try {
                const r = await axios.get(`http://localhost:${port}/chunk/read/${targetChunk.handle}`, { timeout: 1500 });
                return res.json({ content: r.data.data });
            } catch {
                console.warn(`[MW] Read failed from ${port}, trying next...`);
            }
        }
        
        res.status(503).json({ error: "Content Unavailable: All replicas unreachable." });
    } catch (e: any) {
        if (e.response?.status === 403) return res.status(403).json({ error: "Denied" });
        res.status(500).json({ error: "Read Error" });
    }
});

// ==========================================
// ACCESS CONTROL
// ==========================================

app.post("/api/access/request", async (req, res) => {
    try {
        const r = await forwardToLeader('post', '/access/request', req.body);
        res.json(r.data);
    } catch { res.status(400).json({error: "Request Failed"}); }
});

app.get("/api/access/notifications/:userId", async (req, res) => {
    try {
        const r = await forwardToLeader('get', `/access/pending/${req.params.userId}`);
        res.json(r.data);
    } catch { res.status(500).json({error: "Fetch Failed"}); }
});

app.post("/api/access/approve", async (req, res) => {
    try {
        const r = await forwardToLeader('post', '/access/approve', req.body);
        res.json(r.data);
    } catch { res.status(500).json({error: "Action Failed"}); }
});

app.listen(PORT, () => {
    console.log(`[MW] Middleware running on ${PORT}`);
});