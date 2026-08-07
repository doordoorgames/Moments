import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const adminHeaders = () => {
    const token = localStorage.getItem("admin_token");
    return token ? { "X-Admin-Token": token } : {};
};

export const api = {
    // public
    listStories: () => axios.get(`${API_BASE}/stories`).then((r) => r.data),
    createRoom: () => axios.post(`${API_BASE}/rooms`).then((r) => r.data),
    getRoom: (code) => axios.get(`${API_BASE}/rooms/${code}`).then((r) => r.data),
    joinRoom: (code, nickname) =>
        axios.post(`${API_BASE}/rooms/${code}/join`, { nickname }).then((r) => r.data),
    selectStory: (code, story_id) =>
        axios.post(`${API_BASE}/rooms/${code}/select-story`, { story_id }).then((r) => r.data),
    startRoom: (code) => axios.post(`${API_BASE}/rooms/${code}/start`).then((r) => r.data),
    resetRoom: (code) => axios.post(`${API_BASE}/rooms/${code}/reset`).then((r) => r.data),
    castVote: (code, player_id, choice_id) =>
        axios.post(`${API_BASE}/rooms/${code}/vote`, { player_id, choice_id }).then((r) => r.data),

    // admin (unchanged)
    adminLogin: (password) =>
        axios.post(`${API_BASE}/admin/login`, { password }).then((r) => r.data),
    adminVerify: () =>
        axios.get(`${API_BASE}/admin/verify`, { headers: adminHeaders() }).then((r) => r.data),
    adminListStories: () =>
        axios.get(`${API_BASE}/admin/stories`, { headers: adminHeaders() }).then((r) => r.data),
    adminCreateStory: (payload) =>
        axios.post(`${API_BASE}/admin/stories`, payload, { headers: adminHeaders() }).then((r) => r.data),
    adminUpdateStory: (id, payload) =>
        axios.put(`${API_BASE}/admin/stories/${id}`, payload, { headers: adminHeaders() }).then((r) => r.data),
    adminDeleteStory: (id) =>
        axios.delete(`${API_BASE}/admin/stories/${id}`, { headers: adminHeaders() }).then((r) => r.data),
    adminGetGraph: (id) =>
        axios.get(`${API_BASE}/admin/stories/${id}/graph`, { headers: adminHeaders() }).then((r) => r.data),
    adminCreateNode: (payload) =>
        axios.post(`${API_BASE}/admin/nodes`, payload, { headers: adminHeaders() }).then((r) => r.data),
    adminUpdateNode: (id, payload) =>
        axios.put(`${API_BASE}/admin/nodes/${id}`, payload, { headers: adminHeaders() }).then((r) => r.data),
    adminDeleteNode: (id) =>
        axios.delete(`${API_BASE}/admin/nodes/${id}`, { headers: adminHeaders() }).then((r) => r.data),
    adminBulkPositions: (updates) =>
        axios.post(`${API_BASE}/admin/nodes/positions`, updates, { headers: adminHeaders() }).then((r) => r.data),
    adminSetStart: (storyId, nodeId) =>
        axios
            .post(
                `${API_BASE}/admin/stories/${storyId}/set-start?node_id=${encodeURIComponent(nodeId)}`,
                null,
                { headers: adminHeaders() },
            )
            .then((r) => r.data),
    adminRambleTranscribe: (storyId, blob) => {
        const body = new FormData();
        body.append("story_id", storyId);
        body.append("audio", blob, "ramble.webm");
        return axios
            .post(`${API_BASE}/admin/ramble/transcribe`, body, {
                headers: adminHeaders(),
                timeout: 150000,
            })
            .then((r) => r.data);
    },
    adminRambleInterpret: (payload) =>
        axios
            .post(`${API_BASE}/admin/ramble/interpret`, payload, {
                headers: adminHeaders(),
                timeout: 120000,
            })
            .then((r) => r.data),
    adminRambleApply: (payload) =>
        axios
            .post(`${API_BASE}/admin/ramble/apply`, payload, {
                headers: adminHeaders(),
                timeout: 120000,
            })
            .then((r) => r.data),
};

export const wsUrlFor = (code) => {
    if (BACKEND_URL) {
        const base = BACKEND_URL.replace(/^http/, "ws");
        return `${base}/api/ws/rooms/${code}`;
    }
    // Proxy mode: derive ws:// URL from current browser location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/ws/rooms/${code}`;
};
