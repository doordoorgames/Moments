import { buildRouteEdges, routeUpdateFor } from "./graphRouting";

const choice = (id, destination_node_id = null) => ({
    id,
    text: id === "choice-a" ? "Choice A" : "Choice B",
    destination_node_id,
    sets_flag: null,
    requires_flag: null,
});

const nodes = [
    { id: "vote-1", node_type: "story", choices: [choice("choice-a", "narration-1"), choice("choice-b", "vote-2")] },
    { id: "narration-1", node_type: "narration", narration_next_node_id: "narration-2", choices: [] },
    { id: "narration-2", node_type: "narration", narration_next_node_id: "vote-2", choices: [] },
    { id: "vote-2", node_type: "story", choices: [choice("choice-a"), choice("choice-b")] },
];

describe("visual graph routing", () => {
    test("restores existing choice A, choice B, narration, and narration-to-narration routes", () => {
        const edges = buildRouteEdges(nodes);
        expect(edges).toHaveLength(4);
        expect(edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: "vote-1", sourceHandle: "choice-a", target: "narration-1" }),
            expect.objectContaining({ source: "vote-1", sourceHandle: "choice-b", target: "vote-2" }),
            expect.objectContaining({ source: "narration-1", sourceHandle: "narration-next", target: "narration-2" }),
            expect.objectContaining({ source: "narration-2", sourceHandle: "narration-next", target: "vote-2" }),
        ]));
    });

    test("keeps unconnected choice and narration handles open without fake edges", () => {
        expect(buildRouteEdges([
            { id: "vote", node_type: "story", choices: [choice("choice-a"), choice("choice-b")] },
            { id: "narration", node_type: "narration", narration_next_node_id: null, choices: [] },
        ])).toEqual([]);
    });

    test("connects and reconnects choice A without changing choice B", () => {
        const node = nodes[0];
        const update = routeUpdateFor(node, "choice-a", "narration-2");
        expect(update.choices[0].destination_node_id).toBe("narration-2");
        expect(update.choices[1].destination_node_id).toBe("vote-2");
    });

    test("connects choice B independently", () => {
        const update = routeUpdateFor(nodes[0], "choice-b", "narration-2");
        expect(update.choices[0].destination_node_id).toBe("narration-1");
        expect(update.choices[1].destination_node_id).toBe("narration-2");
    });

    test("connects, reconnects, and disconnects narration next", () => {
        expect(routeUpdateFor(nodes[1], "narration-next", "vote-2"))
            .toEqual({ narration_next_node_id: "vote-2" });
        expect(routeUpdateFor(nodes[1], "narration-next", null))
            .toEqual({ narration_next_node_id: null });
    });

    test("disconnects one choice without changing its sibling", () => {
        const update = routeUpdateFor(nodes[0], "choice-a", null);
        expect(update.choices[0].destination_node_id).toBeNull();
        expect(update.choices[1].destination_node_id).toBe("vote-2");
    });

    test("moving cards changes no routing data", () => {
        const moved = nodes.map((node) => ({ ...node, position_x: 900, position_y: 500 }));
        expect(buildRouteEdges(moved)).toEqual(buildRouteEdges(nodes));
    });

    test("restores a pre-feature story node with no node_type field", () => {
        const legacyNodes = [
            { id: "legacy-a", choices: [choice("choice-a", "legacy-b"), choice("choice-b")] },
            { id: "legacy-b", choices: [] },
        ];
        expect(buildRouteEdges(legacyNodes)).toEqual([
            expect.objectContaining({ source: "legacy-a", sourceHandle: "choice-a", target: "legacy-b" }),
        ]);
    });

    test("does not draw a broken route after its destination is deleted", () => {
        const withoutDestination = nodes.filter((node) => node.id !== "vote-2");
        expect(buildRouteEdges(withoutDestination).some((edge) => edge.target === "vote-2")).toBe(false);
    });
});
