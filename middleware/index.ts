import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const CLUSTER_MANAGER = "http://localhost:8000";

const MASTER_PORTS = [6001, 6002, 6003];
const CHUNK_PORTS = [5001, 5002, 5003, 5004];

let currentLeader: number | null = null;

async function getLeaderUrl(): Promise<string> {
    if (currentLeader) return `http://localhost:${currentLeader}`;
    for (const port of MASTER_PORTS) {
        try {
            const res = await axios.get(`http://localhost:${port}/system/status`, { timeout: 1000 });
            if (res.data.is_leader) {
                currentLeader = port;
                return `http://localhost:${port}`;
            }
        } catch (e) { }
    }
    throw new Error("No Leader Found in Cluster");
}

// --- ADMIN ROUTES (Fixed Logic) ---

app.get("/api/admin/cluster-status", async (req, res) => {
    try {
        // 1. Get Process State (Optional context)
        let physicalStatus: any = {};
        try {
            const managerRes = await axios.get(`${CLUSTER_MANAGER}/manager/status`);
            physicalStatus = managerRes.data;
        } catch (e) {
            console.log("Cluster Manager unreachable, relying on network pings.");
        }

        const masters = [];
        const chunkservers = [];

        // 2. Helper to check node status
        const checkNode = async (port: number, type: 'master' | 'chunk') => {
            const endpoint = type === 'master' ? '/system/status' : '/admin/status';
            try {
                // Try to reach the node via HTTP
                const r = await axios.get(`http://localhost:${port}${endpoint}`, { timeout: 1000 });
                // If successful, it is definitely RUNNING, regardless of what Manager says
                return { ...r.data, status: "RUNNING" };
            } catch (e) {
                // If HTTP fails, check if Manager thinks it should be running
                const managerState = physicalStatus[port];
                if (managerState === "RUNNING") {
                    return { node_id: port, port: port, status: "UNREACHABLE" }; // Zombie process or stuck
                } else {
                    return { node_id: port, port: port, status: "STOPPED" };
                }
            }
        };

        // 3. Check all nodes in parallel for speed
        const masterPromises = MASTER_PORTS.map(p => checkNode(p, 'master'));
        const chunkPromises = CHUNK_PORTS.map(p => checkNode(p, 'chunk'));

        const masterResults = await Promise.all(masterPromises);
        const chunkResults = await Promise.all(chunkPromises);

        res.json({ 
            masters: masterResults, 
            chunkservers: chunkResults, 
            current_leader: currentLeader 
        });

    } catch (e) {
        res.status(500).json({ error: "Status check failed" });
    }
});

app.post("/api/admin/node/:action/:port", async (req, res) => {
    const { action, port } = req.params;
    try {
        await axios.post(`${CLUSTER_MANAGER}/manager/${action}/${port}`);
        if (action === 'stop' && parseInt(port) === currentLeader) currentLeader = null;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Control failed" });
    }
});

// --- DOCUMENT ROUTES ---

app.post("/api/docs/create", async (req, res) => {
    const { filename, content, user_id } = req.body;
    try {
        const leaderUrl = await getLeaderUrl();
        const masterRes = await axios.post(`${leaderUrl}/file/create`, { filename, user_id });
        const { file_id, chunk_handle, replicas, primary } = masterRes.data;

        await performWritePipeline(chunk_handle, content, replicas, primary);

        res.json({ success: true, file_id });
    } catch (error: any) {
        currentLeader = null;
        res.status(500).json({ error: "Create Failed" });
    }
});

app.post("/api/docs/update", async (req, res) => {
    const { file_id, content, user_id } = req.body;
    try {
        const leaderUrl = await getLeaderUrl();
        const lookup = await axios.post(`${leaderUrl}/file/lookup/${file_id}`, { user_id });
        const targetChunk = lookup.data.chunks[0]; 
        
        await performWritePipeline(
            targetChunk.handle, 
            content, 
            targetChunk.replicas, 
            targetChunk.primary
        );

        res.json({ success: true });
    } catch (error: any) {
        if (error.response?.status === 403) return res.status(403).json({ error: "Permission Denied" });
        res.status(500).json({ error: "Update Failed" });
    }
});

async function performWritePipeline(handle: string, content: string, replicas: number[], primary: number) {
    const stagePromises = replicas.map((port) => 
        axios.post(`http://localhost:${port}/chunk/stage`, { handle, content })
            .then(() => ({ status: 'fulfilled', port }))
            .catch((e) => ({ status: 'rejected', port, error: e.message }))
    );
    const results = await Promise.all(stagePromises);
    const successfulPorts = results.filter((r: any) => r.status === 'fulfilled').map((r: any) => r.port);

    if (!successfulPorts.includes(primary)) {
        throw new Error("Primary failed to stage data");
    }

    const secondaries = successfulPorts.filter((p: number) => p !== primary);
    await axios.post(`http://localhost:${primary}/chunk/commit`, {
        handle: handle,
        secondaries: secondaries
    });
}

// --- READ & AUTH ---

app.post("/api/docs/read/:fileId", async (req, res) => {
    try {
        const leaderUrl = await getLeaderUrl();
        const lookup = await axios.post(`${leaderUrl}/file/lookup/${req.params.fileId}`, { user_id: req.body.user_id });
        const targetChunk = lookup.data.chunks[0];

        for (const port of targetChunk.replicas) {
            try {
                const r = await axios.get(`http://localhost:${port}/chunk/read/${targetChunk.handle}`);
                return res.json({ content: r.data.data });
            } catch {}
        }
        res.status(503).json({ error: "Unavailable" });
    } catch (e: any) {
        if (e.response?.status === 403) return res.status(403).json({ error: "Denied" });
        res.status(500).json({ error: "Error" });
    }
});

app.post("/api/auth/register", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.post(`${l}/auth/register`, req.body); res.json(r.data); } catch { res.status(500).json({error: "Fail"}); }
});
app.post("/api/auth/login", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.post(`${l}/auth/login`, req.body); res.json(r.data); } catch { res.status(401).json({error: "Fail"}); }
});
app.get("/api/docs/list/:userId", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.get(`${l}/file/list/${req.params.userId}`); res.json(r.data); } catch { res.status(500).json({error: "Fail"}); }
});
app.post("/api/access/request", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.post(`${l}/access/request`, req.body); res.json(r.data); } catch { res.status(400).json({error: "Fail"}); }
});
app.get("/api/access/notifications/:userId", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.get(`${l}/access/pending/${req.params.userId}`); res.json(r.data); } catch { res.status(500).json({error: "Fail"}); }
});
app.post("/api/access/approve", async (req, res) => {
    try { const l = await getLeaderUrl(); const r = await axios.post(`${l}/access/approve`, req.body); res.json(r.data); } catch { res.status(500).json({error: "Fail"}); }
});

app.listen(PORT, () => console.log(`Middleware on ${PORT}`));