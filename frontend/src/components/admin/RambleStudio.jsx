import { useEffect, useRef, useState } from "react";
import {
    Mic,
    Square,
    X,
    Sparkles,
    RotateCcw,
    Check,
    Trash2,
    Pencil,
    Loader2,
    AlertTriangle,
    WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";

const PHASE = { RECORD: "record", TRANSCRIPT: "transcript", PROPOSAL: "proposal" };

function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
}

export default function RambleStudio({ storyId, selectedNode, onClose, onApplied }) {
    const [phase, setPhase] = useState(PHASE.RECORD);
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [transcript, setTranscript] = useState("");
    const [proposal, setProposal] = useState(null);
    const [validation, setValidation] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [aiUnconfigured, setAiUnconfigured] = useState(false);
    const recorder = useRef(null);
    const chunks = useRef([]);
    const timer = useRef(null);

    useEffect(
        () => () => {
            clearInterval(timer.current);
            recorder.current?.stream?.getTracks().forEach((t) => t.stop());
        },
        [],
    );

    const handleApiError = (e) => {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail || e?.message || "Something went wrong.";
        if (status === 503) {
            setAiUnconfigured(true);
            setError(
                "Ramble AI is not yet configured. Add OPENAI_API_KEY to your Replit Secrets and restart the backend. You can still type your story ideas below and build a proposal once the key is set.",
            );
        } else {
            setError(String(detail).slice(0, 300));
        }
    };

    const startRecording = async () => {
        setError("");
        setAiUnconfigured(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            recorder.current = r;
            chunks.current = [];
            r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
            r.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                clearInterval(timer.current);
                setBusy(true);
                try {
                    const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
                    const result = await api.adminRambleTranscribe(storyId, blob);
                    setTranscript(result.transcript);
                    setPhase(PHASE.TRANSCRIPT);
                } catch (e) {
                    handleApiError(e);
                } finally {
                    setBusy(false);
                    setRecording(false);
                }
            };
            r.start(500);
            setSeconds(0);
            setRecording(true);
            timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (e) {
            if (e?.name === "NotAllowedError") {
                setError(
                    "Microphone permission was denied. Allow mic access — or just type your ramble below.",
                );
            } else {
                setError("The microphone could not start. Type your ramble below instead.");
            }
        }
    };

    const stopRecording = () =>
        recorder.current?.state === "recording" && recorder.current.stop();

    const interpret = async (versions = 1) => {
        if (!transcript.trim()) {
            setError("Tell me what should happen in the story first.");
            return;
        }
        setBusy(true);
        setError("");
        setAiUnconfigured(false);
        try {
            const result = await api.adminRambleInterpret({
                story_id: storyId,
                transcript,
                selected_node_id: selectedNode?.id || null,
                variation_count: versions,
            });
            setProposal(result.proposal);
            setValidation(result.validation_errors || []);
            setPhase(PHASE.PROPOSAL);
        } catch (e) {
            handleApiError(e);
        } finally {
            setBusy(false);
        }
    };

    const apply = async () => {
        if (!proposal) return;
        setBusy(true);
        setError("");
        try {
            await api.adminRambleApply({ story_id: storyId, proposal });
            onApplied();
            onClose();
        } catch (e) {
            handleApiError(e);
        } finally {
            setBusy(false);
        }
    };

    const removeOp = (idx) =>
        setProposal((p) => ({ ...p, operations: p.operations.filter((_, i) => i !== idx) }));

    const editOp = (idx, field, value) =>
        setProposal((p) => ({
            ...p,
            operations: p.operations.map((op, i) =>
                i === idx ? { ...op, node: { ...(op.node || {}), [field]: value } } : op,
            ),
        }));

    const allWarnings = [...validation, ...(proposal?.warnings || [])];
    const canApprove =
        proposal && validation.length === 0 && (proposal.operations || []).length > 0 && !busy;

    return (
        <div className="ramble-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ramble-shell">
                {/* Header */}
                <div className="ramble-header">
                    <div className="ramble-header-title">
                        <Mic className="ramble-header-icon" />
                        <span>Ramble Studio</span>
                        {selectedNode && (
                            <span className="ramble-context-pill">
                                from: {selectedNode.title || "selected node"}
                            </span>
                        )}
                    </div>
                    <button className="ramble-close" onClick={onClose} aria-label="Close Ramble">
                        <X />
                    </button>
                </div>

                {/* AI unconfigured banner — non-blocking */}
                {aiUnconfigured && (
                    <div className="ramble-config-banner">
                        <WifiOff className="ramble-config-icon" />
                        <div>
                            <strong>AI not yet connected.</strong> Add{" "}
                            <code>OPENAI_API_KEY</code> to your Replit Secrets and restart the
                            backend. You can still type your story ideas below.
                        </div>
                    </div>
                )}

                {/* Phase: RECORD */}
                {phase === PHASE.RECORD && (
                    <div className="ramble-phase">
                        <button
                            className={`ramble-mic-btn ${recording ? "is-recording" : ""}`}
                            onClick={recording ? stopRecording : startRecording}
                            disabled={busy}
                            aria-label={recording ? "Stop recording" : "Start recording"}
                        >
                            {busy ? (
                                <Loader2 className="animate-spin" />
                            ) : recording ? (
                                <Square />
                            ) : (
                                <Mic />
                            )}
                        </button>
                        <div className="ramble-time">
                            {recording
                                ? fmt(seconds)
                                : busy
                                  ? "Transcribing…"
                                  : "Tap and talk naturally"}
                        </div>
                        {recording && (
                            <button className="ramble-stop-label" onClick={stopRecording}>
                                Stop recording
                            </button>
                        )}

                        <div className="ramble-divider">or type your ramble</div>
                        <textarea
                            className="ramble-textarea"
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            placeholder="Okay so Zayn gets separated here, and I want two paths — one where he asks for help and one where he sneaks through the gate…"
                            rows={5}
                        />
                        <button
                            className="ramble-primary-btn"
                            onClick={() => {
                                setPhase(PHASE.TRANSCRIPT);
                                interpret();
                            }}
                            disabled={busy || !transcript.trim()}
                        >
                            <Sparkles /> Understand my ramble
                        </button>
                    </div>
                )}

                {/* Phase: TRANSCRIPT — review before building proposal */}
                {phase === PHASE.TRANSCRIPT && (
                    <div className="ramble-phase">
                        <label className="ramble-label">
                            Your transcript — edit anything before continuing
                        </label>
                        <textarea
                            className="ramble-textarea ramble-transcript"
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            rows={8}
                        />
                        <div className="ramble-actions">
                            <button onClick={onClose}>Cancel</button>
                            <button
                                className="ramble-primary-btn"
                                onClick={() => interpret()}
                                disabled={busy}
                            >
                                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                                Build proposal
                            </button>
                        </div>
                    </div>
                )}

                {/* Phase: PROPOSAL */}
                {phase === PHASE.PROPOSAL && proposal && (
                    <div className="ramble-phase">
                        <p className="ramble-summary">{proposal.summary}</p>

                        {/* Clarification questions */}
                        {!!proposal.clarifications?.length && (
                            <div className="ramble-clarifications">
                                <strong>
                                    I need {proposal.clarifications.length} thing
                                    {proposal.clarifications.length > 1 ? "s" : ""} from you:
                                </strong>
                                {proposal.clarifications.map((q) => (
                                    <div key={q.id} className="ramble-clarification-item">
                                        <span>{q.question}</span>
                                        <div className="ramble-clarification-options">
                                            {q.options?.map((o) => (
                                                <button
                                                    key={o}
                                                    onClick={() =>
                                                        setTranscript(
                                                            (t) =>
                                                                `${t}\nDecision: ${q.question} → ${o}`,
                                                        )
                                                    }
                                                >
                                                    {o}
                                                </button>
                                            ))}
                                            {q.allow_ai_decide && (
                                                <button
                                                    onClick={() =>
                                                        setTranscript(
                                                            (t) =>
                                                                `${t}\nDecision: ${q.question} → fill in sensible details`,
                                                        )
                                                    }
                                                >
                                                    ✨ You decide
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Proposal cards */}
                        <div className="proposal-board">
                            {(proposal.operations || []).map((op, idx) => (
                                <div
                                    className={`proposal-card tone-${idx % 6}`}
                                    key={op.temp_id || op.node_id || idx}
                                >
                                    <div className="proposal-meta">
                                        <span className="proposal-action-badge">{op.action}</span>
                                        <button
                                            className="proposal-remove"
                                            onClick={() => removeOp(idx)}
                                            aria-label="Remove this operation"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                    {op.action === "delete" ? (
                                        <>
                                            <h3 className="proposal-node-title">Remove node</h3>
                                            <p className="proposal-node-text">{op.reason}</p>
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                className="proposal-title-input"
                                                value={op.node?.title || ""}
                                                onChange={(e) =>
                                                    editOp(idx, "title", e.target.value)
                                                }
                                                placeholder="Node title"
                                            />
                                            <textarea
                                                className="proposal-text-input"
                                                value={op.node?.story_text || ""}
                                                onChange={(e) =>
                                                    editOp(idx, "story_text", e.target.value)
                                                }
                                                rows={4}
                                                placeholder="Story text…"
                                            />
                                            <div className="proposal-character-row">
                                                <Pencil className="proposal-character-icon" />
                                                <input
                                                    value={op.node?.character || ""}
                                                    onChange={(e) =>
                                                        editOp(idx, "character", e.target.value)
                                                    }
                                                    placeholder="Character"
                                                />
                                            </div>
                                            {op.node?.choices?.map((c) => (
                                                <div className="proposal-choice" key={c.id}>
                                                    ↳ {c.text}
                                                    {c.destination_node_id && (
                                                        <span className="proposal-dest">
                                                            → {c.destination_node_id}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Warnings / validation */}
                        {allWarnings.length > 0 && (
                            <div className="ramble-warnings">
                                <AlertTriangle className="ramble-warn-icon" />
                                <ul>
                                    {allWarnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="ramble-actions ramble-actions-four">
                            <button onClick={onClose}>Cancel</button>
                            <button onClick={() => interpret(3)} disabled={busy}>
                                <RotateCcw /> 3 versions
                            </button>
                            <button onClick={() => interpret()} disabled={busy}>
                                <Sparkles /> Regen
                            </button>
                            <button
                                className="ramble-primary-btn"
                                onClick={apply}
                                disabled={!canApprove}
                            >
                                {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve
                            </button>
                        </div>
                    </div>
                )}

                {/* Error display */}
                {error && !aiUnconfigured && (
                    <div className="ramble-error">{error}</div>
                )}
            </div>
        </div>
    );
}
