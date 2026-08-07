import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    MarkerType,
    BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { StoryNode } from "@/components/admin/StoryNode";
import NodeInspector from "@/components/admin/NodeInspector";
import RambleStudio from "@/components/admin/RambleStudio";
import { ArrowLeft, Plus, LogOut, Loader2, Mic, Sparkles } from "lucide-react";

const nodeTypes = { storyNode: StoryNode };

function CanvasInner() {
    const { id: storyId } = useParams();
    const nav = useNavigate();
    const [loading, setLoading] = useState(true);
    const [story, setStory] = useState(null);
    const [rawNodes, setRawNodes] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [rambleOpen, setRambleOpen] = useState(false);
    const positionSaveTimer = useRef(null);

    const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
    const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);

    // --- helpers to (re)build flow graph from raw nodes ---
    const rebuildFlow = useCallback(
        (nodes, startNodeId, selected) => {
            const rf_nodes = nodes.map((n) => ({
                id: n.id,
                type: "storyNode",
                position: { x: n.position_x || 0, y: n.position_y || 0 },
                data: {
                    node: n,
                    isStart: n.id === startNodeId,
                    onSelect: (nid) => setSelectedId(nid),
                },
                selected: n.id === selected,
            }));
            const rf_edges = [];
            for (const n of nodes) {
                for (const c of n.choices || []) {
                    if (c.destination_node_id) {
                        rf_edges.push({
                            id: `${n.id}-${c.id}-${c.destination_node_id}`,
                            source: n.id,
                            sourceHandle: c.id,
                            target: c.destination_node_id,
                            targetHandle: "in",
                            markerEnd: { type: MarkerType.ArrowClosed },
                            label: c.text?.slice(0, 24),
                            labelBgPadding: [4, 2],
                            labelBgStyle: { fill: "hsl(var(--card))" },
                            style: { strokeWidth: 2.5, stroke: "rgba(255,255,255,.92)" },
                        });
                    }
                }
            }
            setFlowNodes(rf_nodes);
            setFlowEdges(rf_edges);
        },
        [setFlowNodes, setFlowEdges],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.adminGetGraph(storyId);
            setStory(data.story);
            setRawNodes(data.nodes || []);
            rebuildFlow(data.nodes || [], data.story?.start_node_id, selectedId);
        } catch (err) {
            if (err?.response?.status === 401) {
                localStorage.removeItem("admin_token");
                nav("/admin");
            } else {
                toast.error("Failed to load graph");
            }
        } finally {
            setLoading(false);
        }
    }, [storyId, rebuildFlow, selectedId, nav]);

    useEffect(() => {
        load();
    }, [load]);

    // When raw graph or selection changes, rebuild
    useEffect(() => {
        if (story) rebuildFlow(rawNodes, story.start_node_id, selectedId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawNodes, story?.start_node_id, selectedId]);

    // Selected node object
    const selectedNode = useMemo(
        () => rawNodes.find((n) => n.id === selectedId) || null,
        [rawNodes, selectedId],
    );

    // --- Persist positions on drag (debounced) ---
    const handleNodesChange = (changes) => {
        onNodesChange(changes);
        const positional = changes.filter((c) => c.type === "position" && c.position);
        if (positional.length > 0) {
            if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
            positionSaveTimer.current = setTimeout(async () => {
                const updates = positional.map((c) => ({
                    id: c.id,
                    position_x: c.position.x,
                    position_y: c.position.y,
                }));
                try {
                    await api.adminBulkPositions(updates);
                    // update local raw
                    setRawNodes((rn) =>
                        rn.map((n) => {
                            const u = updates.find((x) => x.id === n.id);
                            return u
                                ? { ...n, position_x: u.position_x, position_y: u.position_y }
                                : n;
                        }),
                    );
                } catch {
                    // ignore
                }
            }, 400);
        }
    };

    // --- Handle new edge drawn by drag-connect ---
    const onConnect = useCallback(
        async (params) => {
            const { source, sourceHandle, target } = params;
            if (!source || !target || !sourceHandle) return;
            // sourceHandle is choice.id; update that choice's destination_node_id
            const node = rawNodes.find((n) => n.id === source);
            if (!node) return;
            const newChoices = (node.choices || []).map((c) =>
                c.id === sourceHandle ? { ...c, destination_node_id: target } : c,
            );
            try {
                const updated = await api.adminUpdateNode(source, { choices: newChoices });
                setRawNodes((rn) => rn.map((n) => (n.id === source ? updated : n)));
                toast.success("Linked");
            } catch (err) {
                toast.error("Failed to link");
            }
        },
        [rawNodes],
    );

    // --- Actions ---
    const addNode = async () => {
        try {
            // Place near center of current viewport (simple heuristic)
            const cx = 200 + Math.floor(Math.random() * 400);
            const cy = 200 + Math.floor(Math.random() * 200);
            const n = await api.adminCreateNode({
                story_id: storyId,
                title: "New Scene",
                story_text: "",
                character: "",
                position_x: cx,
                position_y: cy,
                choices: [],
            });
            setRawNodes((rn) => [...rn, n]);
            setSelectedId(n.id);
            // If this became the start node, refresh story
            if (!story?.start_node_id) load();
            toast.success("Node added");
        } catch (err) {
            toast.error("Failed to add node");
        }
    };

    const saveNode = async (draft) => {
        try {
            const updated = await api.adminUpdateNode(draft.id, {
                title: draft.title,
                story_text: draft.story_text,
                character: draft.character,
                is_location_gate: !!draft.is_location_gate,
                is_vote_gate: !!draft.is_vote_gate,
                is_end: !!draft.is_end,
                choices: draft.choices,
            });
            setRawNodes((rn) => rn.map((n) => (n.id === updated.id ? updated : n)));
            toast.success("Saved");
        } catch (err) {
            toast.error("Failed to save");
        }
    };

    const deleteNode = async (nodeId) => {
        if (!confirm("Delete this node? Its incoming edges will be cleared.")) return;
        try {
            await api.adminDeleteNode(nodeId);
            setRawNodes((rn) => rn.filter((n) => n.id !== nodeId));
            setSelectedId(null);
            // reload story in case start was cleared
            load();
            toast.success("Deleted");
        } catch (err) {
            toast.error("Failed to delete");
        }
    };

    const setStart = async (nodeId) => {
        try {
            const s = await api.adminSetStart(storyId, nodeId);
            setStory(s);
            toast.success("Start node set");
        } catch (err) {
            toast.error("Failed to set start");
        }
    };

    if (loading) {
        return (
            <div className="dark flex min-h-screen items-center justify-center bg-background text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="creator-theme flex h-screen flex-col bg-background text-foreground">
            <div className="creator-topbar flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                    <Link
                        to="/admin/stories"
                        className="creator-back inline-flex items-center gap-1.5 text-sm"
                        data-testid="admin-back-to-stories"
                    >
                        <ArrowLeft className="h-4 w-4" /> Stories
                    </Link>
                    <div className="creator-title text-sm">
                        <span className="font-semibold">{story?.title}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                            {rawNodes.length} nodes
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" className="ramble-launch" onClick={() => setRambleOpen(true)} data-testid="admin-ramble-button">
                        <Mic className="mr-1 h-4 w-4" /> Ramble
                    </Button>
                    <Button size="sm" onClick={addNode} data-testid="admin-add-node-button">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add story card
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            localStorage.removeItem("admin_token");
                            nav("/admin");
                        }}
                    >
                        <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="creator-canvas flex-1" data-testid="admin-canvas">
                    <div className="canvas-note"><Sparkles/> drag ideas around • connect the adventure</div>
                    <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={(_, n) => setSelectedId(n.id)}
                        onPaneClick={() => setSelectedId(null)}
                        nodeTypes={nodeTypes}
                        fitView
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(255,255,255,.28)" />
                        <Controls showInteractive={false} />
                        <MiniMap pannable zoomable className="creator-minimap" nodeColor={(n) => n.data?.node?.is_end ? "#8c5ac7" : "#f37b78"} />
                    </ReactFlow>
                </div>
                {selectedNode && (
                    <NodeInspector
                        node={selectedNode}
                        allNodes={rawNodes}
                        isStart={selectedNode.id === story?.start_node_id}
                        onSave={saveNode}
                        onDelete={deleteNode}
                        onSetStart={setStart}
                        onClose={() => setSelectedId(null)}
                    />
                )}
            </div>
            {rambleOpen && <RambleStudio storyId={storyId} selectedNode={selectedNode} onClose={() => setRambleOpen(false)} onApplied={load} />}
        </div>
    );
}

export default function AdminCanvas() {
    return (
        <ReactFlowProvider>
            <CanvasInner />
        </ReactFlowProvider>
    );
}
