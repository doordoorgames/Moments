import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

/**
 * Full-screen spinning wheel for tie-breaks.
 * Renders `options` as equal slices. Deterministically lands on `winnerId` after `durationMs`.
 */
export default function Wheel({ options, winnerId, durationMs = 4200 }) {
    const n = options?.length || 0;
    const sliceAngle = n > 0 ? 360 / n : 0;

    // Palette for slices
    const palette = [
        "#B04A22", // primary
        "#2F7A66", // accent
        "#D28A2A", // warning
        "#7A5FA0", // violet
        "#4A6FB0", // blue
        "#B02A5A", // magenta
        "#2A8FB0", // cyan
        "#8AA82F", // olive
    ];

    // Choose target rotation so winner lands under the top pointer.
    // Pointer is at 12 o'clock (0deg on SVG). Slice i is centered at (i + 0.5) * sliceAngle.
    const targetRotation = useMemo(() => {
        if (n === 0) return 0;
        const winnerIdx = Math.max(0, options.findIndex((o) => o.id === winnerId));
        const centerAngle = (winnerIdx + 0.5) * sliceAngle; // clockwise from 12
        // Rotate the wheel COUNTER-clockwise by centerAngle so winner slice is at top; add 5 full spins
        return -(centerAngle) + 360 * 5;
    }, [options, winnerId, n, sliceAngle]);

    const [rot, setRot] = useState(0);
    useEffect(() => {
        // kick off animation next tick
        const id = requestAnimationFrame(() => setRot(targetRotation));
        return () => cancelAnimationFrame(id);
    }, [targetRotation]);

    // SVG geometry
    const R = 140;
    const CX = 160;
    const CY = 160;

    const arcPath = (i) => {
        const start = i * sliceAngle - 90; // start at top
        const end = start + sliceAngle;
        const rad = (deg) => (deg * Math.PI) / 180;
        const x1 = CX + R * Math.cos(rad(start));
        const y1 = CY + R * Math.sin(rad(start));
        const x2 = CX + R * Math.cos(rad(end));
        const y2 = CY + R * Math.sin(rad(end));
        const large = sliceAngle > 180 ? 1 : 0;
        return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    };

    const labelPos = (i) => {
        const mid = (i + 0.5) * sliceAngle - 90;
        const rad = (mid * Math.PI) / 180;
        const rr = R * 0.62;
        return { x: CX + rr * Math.cos(rad), y: CY + rr * Math.sin(rad), angle: mid };
    };

    const [showWinner, setShowWinner] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setShowWinner(true), durationMs - 250);
        return () => clearTimeout(t);
    }, [durationMs]);

    const winner = options.find((o) => o.id === winnerId);

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur"
            data-testid="wheel-overlay"
        >
            <div className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
                It's a tie — spinning the wheel…
            </div>

            <div className="relative" style={{ width: 320, height: 340 }}>
                {/* Pointer */}
                <div
                    className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
                    style={{ marginTop: -4 }}
                    aria-hidden
                >
                    <svg width="22" height="28" viewBox="0 0 22 28">
                        <path d="M11 26 L2 6 L20 6 Z" fill="hsl(var(--foreground))" />
                    </svg>
                </div>

                <motion.svg
                    width="320"
                    height="320"
                    viewBox="0 0 320 320"
                    style={{ marginTop: 12, originX: "50%", originY: "50%" }}
                    animate={{ rotate: rot }}
                    transition={{ duration: durationMs / 1000, ease: [0.16, 0.9, 0.2, 1] }}
                >
                    {options.map((opt, i) => (
                        <g key={opt.id}>
                            <path d={arcPath(i)} fill={palette[i % palette.length]} stroke="hsl(var(--card))" strokeWidth="2" />
                            {(() => {
                                const { x, y, angle } = labelPos(i);
                                return (
                                    <text
                                        x={x}
                                        y={y}
                                        fill="#ffffff"
                                        fontSize="12"
                                        fontWeight="600"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        transform={`rotate(${angle + 90}, ${x}, ${y})`}
                                    >
                                        {truncateLabel(opt.text)}
                                    </text>
                                );
                            })()}
                        </g>
                    ))}
                    <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--card))" strokeWidth="4" />
                    <circle cx={CX} cy={CY} r={16} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="2" />
                </motion.svg>
            </div>

            {showWinner && winner && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 rounded-full bg-card px-4 py-2 text-sm shadow"
                    data-testid="wheel-winner"
                >
                    <span className="text-muted-foreground">Winner: </span>
                    <span className="font-semibold text-foreground">{winner.text}</span>
                </motion.div>
            )}
        </div>
    );
}

function truncateLabel(t) {
    if (!t) return "";
    return t.length > 18 ? t.slice(0, 17) + "…" : t;
}
