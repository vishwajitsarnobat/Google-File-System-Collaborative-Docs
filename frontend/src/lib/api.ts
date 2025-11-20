import axios from "axios";

const API_URL = "http://localhost:3000/api";

export interface GFSFile {
    id: string;
    filename: string;
    content?: string;
}

export interface NodeStatus {
    node_id?: number;
    port?: number;
    status: "RUNNING" | "STOPPED" | "UNREACHABLE";
}

export const api = {
    // --- Auth Operations ---
    login: async (credentials: any) => {
        const res = await axios.post(`${API_URL}/auth/login`, credentials);
        return res.data;
    },

    register: async (credentials: any) => {
        const res = await axios.post(`${API_URL}/auth/register`, credentials);
        return res.data;
    },

    // --- File Operations ---
    createFile: async (filename: string, content: string, userId: string) => {
        const res = await axios.post(`${API_URL}/docs/create`, { 
            filename, 
            content,
            user_id: userId 
        });
        return res.data;
    },

    readFile: async (fileId: string, userId: string) => {
        const res = await axios.post(`${API_URL}/docs/read/${fileId}`, { 
            user_id: userId 
        });
        return res.data;
    },

    updateFile: async (fileId: string, content: string, userId: string) => {
        const res = await axios.post(`${API_URL}/docs/update`, {
            file_id: fileId,
            content,
            user_id: userId
        });
        return res.data;
    },

    // --- Admin Operations ---
    getSystemStatus: async () => {
        const res = await axios.get(`${API_URL}/admin/cluster-status`);
        return res.data;
    },

    killNode: async (port: number) => {
        const res = await axios.post(`${API_URL}/admin/node/stop/${port}`);
        return res.data;
    },
    
    startNode: async (port: number) => {
        const res = await axios.post(`${API_URL}/admin/node/start/${port}`);
        return res.data;
    }
};