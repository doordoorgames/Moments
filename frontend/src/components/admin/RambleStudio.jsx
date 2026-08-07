import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Sparkles, RotateCcw, Check, Trash2, Pencil, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const PHASE = { RECORD: "record", TRANSCRIPT: "transcript", PROPOSAL: "proposal" };

export default function RambleStudio({ storyId, selectedNode, onClose, onApplied }) {
    const [phase, setPhase] = useState(PHASE.RECORD);
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [transcript, setTranscript] = useState("");
    const [proposal, setProposal] = useState(null);
    const [validation, setValidation] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const recorder = useRef(null);
    const chunks = useRef([]);
    const timer = useRef(null);

    useEffect(() => () => { clearInterval(timer.current); recorder.current?.stream?.getTracks().forEach(t => t.stop()); }, []);

    const start = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            recorder.current = r; chunks.current = [];
            r.ondataavailable = e => e.data.size && chunks.current.push(e.data);
            r.onstop = async () => {
                stream.getTracks().forEach(t => t.stop()); clearInterval(timer.current);
                setBusy(true);
                try {
                    const result = await api.adminRambleTranscribe(storyId, new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
                    setTranscript(result.transcript); setPhase(PHASE.TRANSCRIPT);
                } catch (e) { setError(e?.response?.data?.detail || "I couldn't transcribe that recording. Your story was not changed."); }
                finally { setBusy(false); setRecording(false); }
            };
            r.start(500); setSeconds(0); setRecording(true);
            timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } catch (e) { setError(e?.name === "NotAllowedError" ? "Microphone permission was denied. Allow microphone access, or type your ramble below." : "The microphone could not start. You can type your ramble below."); }
    };
    const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
    const interpret = async (versions = 1) => {
        if (!transcript.trim()) return setError("Tell me what should happen first.");
        setBusy(true); setError("");
        try {
            const result = await api.adminRambleInterpret({ story_id: storyId, transcript, selected_node_id: selectedNode?.id || null, variation_count: versions });
            setProposal(result.proposal); setValidation(result.validation_errors || []); setPhase(PHASE.PROPOSAL);
        } catch (e) { setError(e?.response?.data?.detail || "I couldn't interpret that ramble. Your story was not changed."); }
        finally { setBusy(false); }
    };
    const removeOp = idx => setProposal(p => ({ ...p, operations: p.operations.filter((_, i) => i !== idx) }));
    const editOp = (idx, field, value) => setProposal(p => ({ ...p, operations: p.operations.map((op, i) => i === idx ? { ...op, node: { ...(op.node || {}), [field]: value } } : op) }));
    const apply = async () => {
        setBusy(true); setError("");
        try { await api.adminRambleApply({ story_id: storyId, proposal }); await onApplied(); onClose(); }
        catch (e) { const detail = e?.response?.data?.detail; setError(typeof detail === "string" ? detail : detail?.errors?.join(" ") || "Proposal could not be applied. Your original story is safe."); }
        finally { setBusy(false); }
    };
    const time = `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;

    return <div className="ramble-overlay" role="dialog" aria-modal="true" aria-label="Ramble story assistant">
        <div className="ramble-shell">
            <button className="ramble-close" onClick={onClose} aria-label="Cancel ramble"><X /></button>
            <div className="ramble-kicker">✦ TALK YOUR STORY INTO LIFE ✦</div>
            <h2>{phase === PHASE.PROPOSAL ? "Here’s what I understood" : "Ramble"}</h2>
            {selectedNode && <div className="ramble-context">Working near: <b>{selectedNode.title}</b></div>}
            {phase === PHASE.RECORD && <>
                <button className={`ramble-mic ${recording ? "is-recording" : ""}`} onClick={recording ? stop : start} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin"/> : recording ? <Square/> : <Mic/>}
                </button>
                <div className="ramble-time">{recording ? time : busy ? "Transcribing…" : "Tap and talk naturally"}</div>
                {recording && <button className="ramble-stop" onClick={stop}>Stop recording</button>}
                <div className="ramble-or">or type your ramble</div>
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Okay, Zain gets separated here…" />
                <button className="ramble-primary" onClick={() => { setPhase(PHASE.TRANSCRIPT); interpret(); }} disabled={busy || !transcript.trim()}><Sparkles/> Understand my ramble</button>
            </>}
            {phase === PHASE.TRANSCRIPT && <>
                <label className="ramble-label">Your transcript — edit anything before we continue</label>
                <textarea className="ramble-transcript" value={transcript} onChange={e => setTranscript(e.target.value)} />
                <div className="ramble-actions"><button onClick={onClose}>Cancel</button><button className="ramble-primary" onClick={() => interpret()} disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Sparkles/>} Build proposal</button></div>
            </>}
            {phase === PHASE.PROPOSAL && proposal && <>
                <p className="ramble-summary">{proposal.summary}</p>
                {!!proposal.clarifications?.length && <div className="ramble-questions"><b>I need {proposal.clarifications.length} thing{proposal.clarifications.length > 1 ? "s" : ""} from you.</b>{proposal.clarifications.map(q => <div key={q.id}><span>{q.question}</span><div>{q.options?.map(o => <button key={o} onClick={() => setTranscript(t => `${t}\nDecision: ${q.question} ${o}`)}>{o}</button>)}{q.allow_ai_decide && <button onClick={() => setTranscript(t => `${t}\nDecision: ${q.question} Fill sensible details.`)}>✨ You decide</button>}</div></div>)}</div>}
                <div className="proposal-board">{(proposal.operations || []).map((op, idx) => <div className={`proposal-card tone-${idx % 6}`} key={op.temp_id || op.node_id || idx}>
                    <div className="proposal-meta"><span>{op.action}</span><button onClick={() => removeOp(idx)} aria-label="Remove proposal"><Trash2/></button></div>
                    {op.action === "delete" ? <><h3>Remove node</h3><p>{op.reason}</p></> : <><input value={op.node?.title || ""} onChange={e => editOp(idx,"title",e.target.value)} /><textarea value={op.node?.story_text || ""} onChange={e => editOp(idx,"story_text",e.target.value)} /><div className="proposal-character"><Pencil/> <input value={op.node?.character || ""} onChange={e => editOp(idx,"character",e.target.value)} placeholder="Character" /></div>{op.node?.choices?.map(c => <div className="proposal-choice" key={c.id}>↳ {c.text}</div>)}</>}
                </div>)}</div>
                {(validation.length > 0 || proposal.warnings?.length > 0) && <div className="ramble-warning">{[...validation, ...(proposal.warnings || [])].map(w => <div key={w}>• {w}</div>)}</div>}
                <div className="ramble-actions four"><button onClick={onClose}>Cancel</button><button onClick={() => interpret(3)} disabled={busy}><RotateCcw/> Give me 3 versions</button><button onClick={() => interpret()} disabled={busy}><Sparkles/> Regenerate</button><button className="ramble-primary" onClick={apply} disabled={busy || validation.length > 0 || !proposal.operations?.length}>{busy ? <Loader2 className="animate-spin"/> : <Check/>} Approve</button></div>
            </>}
            {error && <div className="ramble-error">{String(error)}</div>}
        </div>
    </div>;
}
