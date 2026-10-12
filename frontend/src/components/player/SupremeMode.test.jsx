import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "@/lib/api";
import SharedStory from "./SharedStory";
import Shoug2Story from "./Shoug2Story";

jest.mock("@/lib/api", () => ({ api: { castVote: jest.fn().mockResolvedValue({ ok: true }) } }));
global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
    api.castVote.mockClear();
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
});

test.each([SharedStory, Shoug2Story])("%p permits consecutive Supreme choices without countdown UI", async (Story) => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const state = {
        story: { title: "Shoug’s Tale" }, room: { phase: "voting", flags: [], supreme_test_mode: true, phase_ends_at: null, node_visit_id: "visit" },
        players: [{ id: "p", is_host: true }], vote_stats: { voted_player_ids: [], voted_count: 0, total_players: 2 },
    };
    for (let i = 0; i < 5; i++) {
        await act(async () => root.render(<Story state={{ ...state, current_node: { id: `n${i}`, story_text: "London" }, choices: [{ id: `c${i}`, text: "Continue" }] }} player={{ id: "p", session_token: "token" }} code="TEST" />));
        const button = host.querySelector(`[data-testid="choice-vote-c${i}"]`);
        expect(button.disabled).toBe(false);
        expect(host.querySelector('[data-testid="vote-status-row"]')).toBeNull();
        await act(async () => button.click());
        expect(api.castVote).toHaveBeenLastCalledWith("TEST", "p", `c${i}`, `n${i}`, "token", "visit");
    }
    expect(api.castVote).toHaveBeenCalledTimes(5);
    await act(async () => root.unmount()); host.remove();
});

test.each([SharedStory, Shoug2Story])("%p retains normal reading locks and voting status", async (Story) => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const state = { story: { title: "Shoug’s Tale" }, current_node: { id: "n0", story_text: "London" }, choices: [{ id: "c0", text: "Continue" }], room: { phase: "reading", flags: [] }, players: [{ id: "p" }], vote_stats: { voted_player_ids: [] } };
    await act(async () => root.render(<Story state={state} player={{ id: "p" }} code="TEST" />));
    expect(host.querySelector('[data-testid="choice-vote-c0"]').disabled).toBe(true);
    await act(async () => root.render(<Story state={{ ...state, room: { ...state.room, phase: "voting" } }} player={{ id: "p" }} code="TEST" />));
    expect(host.querySelector('[data-testid="vote-status-row"]')).not.toBeNull();
    await act(async () => root.unmount()); host.remove();
});
