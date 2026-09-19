import "@/pages/VisualTest.css";
import "@/components/player/PlayerTheme.css";

function Signal() {
    return <span className="vt-signal compact" aria-label="Signal online">{[1, 2, 3, 4].map((bar) => <i key={bar} style={{ "--bar": bar }} />)}</span>;
}

export default function PlayerFrame({ children, code, playerName }) {
    return (
        <main className="vt-root player-theme-root">
            <div className="vt-burst" aria-hidden="true" />
            <div className="vt-orbit-bg orbit-one" aria-hidden="true" />
            <div className="vt-orbit-bg orbit-two" aria-hidden="true" />
            <div className="vt-noise" aria-hidden="true" />
            <div className="vt-device">
                <span className="vt-antenna"><i /></span>
                <span className="vt-side-key key-a" /><span className="vt-side-key key-b" />
                {['a', 'b', 'c', 'd'].map((position) => <span className={`vt-screw screw-${position}`} key={position}>×</span>)}
                <div className="vt-device-cap">
                    <div className="vt-speaker">{Array.from({ length: 7 }).map((_, index) => <i key={index} />)}</div>
                    <strong>DORDOR</strong><span>DD–02</span>
                </div>
                <div className="vt-display-shell player-display-shell">
                    <header className="vt-status">
                        <div className="vt-network"><Signal /><span>{code ? `ROOM ${code}` : "DORDOR NET"}</span></div>
                        <span className="vt-clock">LIVE</span>
                        <span className="vt-online"><i />{playerName || "LINK"}</span>
                    </header>
                    <div className="vt-crt-lines" aria-hidden="true" />
                    {children}
                </div>
                <footer className="vt-footer"><span className="vt-led pink" /><span className="vt-led mint" /><div className="vt-footer-track"><i /></div><b>SECRET MODE</b><span className="vt-dial"><i /></span></footer>
            </div>
        </main>
    );
}
