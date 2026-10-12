import { act } from "react";
import { createRoot } from "react-dom/client";
import SupremeControls from "./SupremeControls";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({ api: { testNodes: jest.fn(), testControl: jest.fn(), listStories: jest.fn() } }));
global.IS_REACT_ACT_ENVIRONMENT = true;
const player = { id: "host", session_token: "secret" };
const state = { room: { started: true, supreme_test_mode: true, test_creator_id: "host", story_id: "story", current_node_id: "n1", node_visit_id: "visit", test_history_length: 1 } };
let container, root;
beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    api.testNodes.mockResolvedValue({ nodes: [{ id: "n1", story_text: "Airport" }, { id: "n2", story_text: "London" }] });
    api.listStories.mockResolvedValue([{ id: "story", title: "Shoug’s Tale" }]);
    api.testControl.mockResolvedValue({ room: { ...state.room, current_node_id: "n2" } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test.each([{ ...state, room: { ...state.room, supreme_test_mode: false } }, state])("menu stays hidden for ordinary rooms and other sessions", async s => {
    await act(async () => root.render(<SupremeControls code="TEST" player={{ id: "guest", session_token: "guest" }} state={s} />));
    expect(container.querySelector('[data-testid="supreme-controls"]')).toBeNull();
    expect(api.testNodes).not.toHaveBeenCalled();
});

test("creator menu loads real nodes and sends authenticated jump with visit token", async () => {
    const onState = jest.fn();
    await act(async () => root.render(<SupremeControls code="TEST" player={player} state={state} onState={onState} />));
    await act(async () => container.querySelector("button").click());
    expect(api.testNodes).toHaveBeenCalledWith("TEST", { player_id: "host", session_token: "secret" });
    const jump = [...container.querySelectorAll("button")].find(b => b.textContent.includes("n2"));
    await act(async () => jump.click());
    expect(api.testControl).toHaveBeenCalledWith("TEST", { action: "jump", node_id: "n2", player_id: "host", session_token: "secret", visit_id: "visit" });
    expect(onState.mock.calls[0][0].room.current_node_id).toBe("n2");
    expect(container.querySelector('[aria-label="Search nodes"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Switch tale"]')).not.toBeNull();
});

test("ending retains restart and back controls", async () => {
    await act(async () => root.render(<SupremeControls code="TEST" player={player} state={{ room: { ...state.room, phase: "ended" } }} />));
    await act(async () => container.querySelector("button").click());
    const restart = [...container.querySelectorAll("button")].find(b => b.textContent === "Restart story");
    await act(async () => restart.click());
    expect(api.testControl.mock.calls[0][1].action).toBe("restart_story");
});
