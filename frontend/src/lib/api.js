import axios from "axios";

export class BackendConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "BackendConfigError";
    }
}

export const normalizeBackendUrl = (value) => {
    const configured = (value || "").trim().replace(/\/+$/, "");
    if (!configured) return "";

    // Accept either https://backend.example or https://backend.example/api.
    // API routes are appended in exactly one place below.
    return configured.replace(/\/api$/i, "");
};

export const BACKEND_URL = normalizeBackendUrl(process.env.REACT_APP_BACKEND_URL);

export const adminLoginErrorMessage = (err) => {
    if (err?.name === "BackendConfigError") return err.message;

    const status = err?.response?.status;
    if (status === 401) return err?.response?.data?.detail || "Invalid password.";
    if (status >= 500) return "The Moments backend returned a server error. Please try again shortly.";
    if (status) {
        return err?.response?.data?.detail || `The backend request failed (HTTP ${status}).`;
    }
    if (err?.request) {
        return "Unable to reach the Moments backend. Check the backend URL, HTTPS, availability, and CORS configuration.";
    }
    return "Could not send the sign-in request. Please try again.";
};

const apiUrl = (path) => {
    if (!BACKEND_URL) {
        throw new BackendConfigError(
            "Backend connection is not configured. Set REACT_APP_BACKEND_URL in Vercel and redeploy.",
        );
    }

    if (
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        BACKEND_URL.startsWith("http://")
    ) {
        throw new BackendConfigError(
            "The backend URL must use HTTPS when the Moments frontend uses HTTPS.",
        );
    }

    return `${BACKEND_URL}/api${path}`;
};

const adminHeaders = () => {
    const token = localStorage.getItem("admin_token");
    return token ? { "X-Admin-Token": token } : {};
};

export const api = {
    // public
    listStories: () => axios.get(apiUrl("/stories")).then((r) => r.data),
    createRoom: () => axios.post(apiUrl("/rooms")).then((r) => r.data),
    getRoom: (code) => axios.get(apiUrl(`/rooms/${code}`)).then((r) => r.data),
    joinRoom: (code, nickname) =>
        axios.post(apiUrl(`/rooms/${code}/join`), { nickname }).then((r) => r.data),
    selectStory: (code, story_id) =>
        axios.post(apiUrl(`/rooms/${code}/select-story`), { story_id }).then((r) => r.data),
    startRoom: (code) => axios.post(apiUrl(`/rooms/${code}/start`)).then((r) => r.data),
    resetRoom: (code) => axios.post(apiUrl(`/rooms/${code}/reset`)).then((r) => r.data),
    castVote: (code, player_id, choice_id) =>
        axios.post(apiUrl(`/rooms/${code}/vote`), { player_id, choice_id }).then((r) => r.data),

    // admin (unchanged)
    adminLogin: (password) =>
        axios.post(apiUrl("/admin/login"), { password }).then((r) => r.data),
    adminVerify: () =>
        axios.get(apiUrl("/admin/verify"), { headers: adminHeaders() }).then((r) => r.data),
    adminListStories: () =>
        axios.get(apiUrl("/admin/stories"), { headers: adminHeaders() }).then((r) => r.data),
    adminCreateStory: (payload) =>
        axios.post(apiUrl("/admin/stories"), payload, { headers: adminHeaders() }).then((r) => r.data),
    adminUpdateStory: (id, payload) =>
        axios.put(apiUrl(`/admin/stories/${id}`), payload, { headers: adminHeaders() }).then((r) => r.data),
    adminDeleteStory: (id) =>
        axios.delete(apiUrl(`/admin/stories/${id}`), { headers: adminHeaders() }).then((r) => r.data),
    adminGetGraph: (id) =>
        axios.get(apiUrl(`/admin/stories/${id}/graph`), { headers: adminHeaders() }).then((r) => r.data),
    adminCreateNode: (payload) =>
        axios.post(apiUrl("/admin/nodes"), payload, { headers: adminHeaders() }).then((r) => r.data),
    adminUpdateNode: (id, payload) =>
        axios.put(apiUrl(`/admin/nodes/${id}`), payload, { headers: adminHeaders() }).then((r) => r.data),
    adminDeleteNode: (id) =>
        axios.delete(apiUrl(`/admin/nodes/${id}`), { headers: adminHeaders() }).then((r) => r.data),
    adminBulkPositions: (updates) =>
        axios.post(apiUrl("/admin/nodes/positions"), updates, { headers: adminHeaders() }).then((r) => r.data),
    adminSetStart: (storyId, nodeId) =>
        axios
            .post(
                apiUrl(`/admin/stories/${storyId}/set-start?node_id=${encodeURIComponent(nodeId)}`),
                null,
                { headers: adminHeaders() },
            )
            .then((r) => r.data),
    adminRambleTranscribe: (storyId, blob) => {
        const body = new FormData();
        body.append("story_id", storyId);
        body.append("audio", blob, "ramble.webm");
        return axios
            .post(apiUrl("/admin/ramble/transcribe"), body, {
                headers: adminHeaders(),
                timeout: 150000,
            })
            .then((r) => r.data);
    },
    adminRambleInterpret: (payload) =>
        axios
            .post(apiUrl("/admin/ramble/interpret"), payload, {
                headers: adminHeaders(),
                timeout: 120000,
            })
            .then((r) => r.data),
    adminRambleApply: (payload) =>
        axios
            .post(apiUrl("/admin/ramble/apply"), payload, {
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
