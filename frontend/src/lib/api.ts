import axios from "axios";

const API_URL = "http://localhost:3000/api";

export interface GFSFile {
    id: string;
    filename: string;
    content?: string;
}

export interface NodeStatus {
    port: number;
    status: "ACTIVE" | "DEAD"; // Mapped from backend
}

export const api = {
    // File Operations
    createFile: async (filename: string, content: string) => {
        const res = await axios.post(`${API_URL}/files`, { filename, content });
        return res.data;
    },

    readFile: async (fileId: string) => {
        const res = await axios.get(`${API_URL}/files/${fileId}`);
        return res.data;
    },

    // Admin Operations
    getSystemStatus: async () => {
        const res = await axios.get(`${API_URL}/admin/status`);
        return res.data;
    },

    killNode: async (port: number) => {
        const res = await axios.post(`${API_URL}/admin/kill/${port}`);
        return res.data;
    }
};