import { MarkerType } from "@xyflow/react";

export const CHOICE_COLORS = ["#fff4a8", "#8ce7ff", "#c9a2ff", "#a7f3d0"];
export const NARRATION_COLOR = "#ff69b4";

const edgeBase = (source, sourceHandle, target, color, label, routeType, choiceIndex = null) => ({
    id: `route:${source}:${sourceHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle: "in",
    type: "smoothstep",
    reconnectable: "target",
    markerEnd: { type: MarkerType.ArrowClosed, color },
    label,
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 8,
    labelBgStyle: { fill: "rgba(69,40,78,.94)", color, fontSize: 11 },
    labelStyle: { fill: color, fontWeight: 800 },
    style: {
        strokeWidth: 3,
        stroke: color,
        strokeDasharray: routeType === "choice" && choiceIndex % 2 === 1 ? "9 5" : undefined,
    },
    data: { routeType, choiceIndex },
});

export const buildRouteEdges = (nodes) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = [];

    for (const node of nodes) {
        if (
            node.node_type === "narration" &&
            node.narration_next_node_id &&
            nodeIds.has(node.narration_next_node_id)
        ) {
            edges.push(
                edgeBase(
                    node.id,
                    "narration-next",
                    node.narration_next_node_id,
                    NARRATION_COLOR,
                    "NEXT",
                    "narration",
                ),
            );
        }

        for (const [choiceIndex, choice] of (node.choices || []).entries()) {
            if (!choice.destination_node_id || !nodeIds.has(choice.destination_node_id)) continue;
            const color = CHOICE_COLORS[choiceIndex % CHOICE_COLORS.length];
            const choiceLetter = String.fromCharCode(65 + choiceIndex);
            edges.push(
                edgeBase(
                    node.id,
                    choice.id,
                    choice.destination_node_id,
                    color,
                    `${choiceLetter} · ${(choice.text || "Choice").slice(0, 20)}`,
                    "choice",
                    choiceIndex,
                ),
            );
        }
    }

    return edges;
};

export const routeUpdateFor = (node, sourceHandle, destinationNodeId) => {
    if (node.node_type === "narration" && sourceHandle === "narration-next") {
        return { narration_next_node_id: destinationNodeId || null };
    }

    const choices = (node.choices || []).map((choice) =>
        choice.id === sourceHandle
            ? { ...choice, destination_node_id: destinationNodeId || null }
            : choice,
    );
    if (!choices.some((choice) => choice.id === sourceHandle)) return null;
    return { choices };
};
