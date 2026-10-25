import React, {memo} from 'react';

// Dystopian anime circuit board: four stationary corner pieces (two hand-drawn designs, each used
// twice and flipped), so the centre stays quiet behind the monitor. Pure SVG + CSS. The only motion
// is an occasional slow mint pulse travelling along one trace, fading in and out (CSS only).
// No text, digits or symbols.

const TRACE = 'lch-trace', BUS = 'lch-trace lch-bus';

function Pad({x, y, hi}) {
  return <rect className={hi ? 'lch-pad lch-pad-hi' : 'lch-pad'} x={x - 6} y={y - 6} width="12" height="12"/>;
}

function Pulse({d, delay, dur}) {
  return <g style={{'--d': `${delay}s`, '--t': `${dur}s`}}>
    <path className="lch-pulse-glow" d={d} pathLength="1000"/>
    <path className="lch-pulse" d={d} pathLength="1000"/>
  </g>;
}

// Design A, drawn for the top-left corner.
const A = {
  traces: [
    [BUS, 'M0 60 H240 L300 120 H520'],
    [BUS, 'M0 76 H233 L293 136 H470'],
    [BUS, 'M0 92 H226 L286 152 H420'],
    [TRACE, 'M380 0 V40 L420 80 H640'],
    [TRACE, 'M560 0 V24 L590 54 H720'],
    [TRACE, 'M0 230 H90 L150 290 V400 L190 440 H260'],
    [TRACE, 'M0 248 H82 L134 300 V420'],
    [TRACE, 'M0 520 H40 L100 460 H180'],
    [TRACE, 'M270 203 H360'],
    [TRACE, 'M0 560 H60 L100 520 H220 L250 490'],
    [TRACE, 'M300 300 H420 L460 260 H560'],
    [TRACE, 'M300 316 H414'],
  ],
  pads: [[520, 120, true], [470, 136], [420, 152], [640, 80], [720, 54, true], [260, 440, true], [134, 420], [180, 460], [360, 203, true], [250, 490], [560, 260, true], [414, 316]],
  chip: {x: 200, y: 180, w: 70, h: 46, pins: [[210, 172, 210, 180], [225, 172, 225, 180], [240, 172, 240, 180], [255, 172, 255, 180], [210, 226, 210, 234], [225, 226, 225, 234], [240, 226, 240, 234], [255, 226, 255, 234]]},
  pulses: [['M0 60 H240 L300 120 H520', 3, 26], ['M0 230 H90 L150 290 V400 L190 440 H260', 15, 31],
    ['M380 0 V40 L420 80 H640', 9, 23], ['M300 300 H420 L460 260 H560', 20, 27]],
};

// Design B, also drawn for the top-left corner, then flipped into place.
const B = {
  traces: [
    [BUS, 'M0 140 H120 L200 60 H380 L420 20 V0'],
    [BUS, 'M0 156 H127 L207 76 H300'],
    [TRACE, 'M260 0 V18 L232 46'],
    [TRACE, 'M0 300 H60 L120 360 H300 L340 400'],
    [TRACE, 'M0 316 H53 L109 372 H240'],
    [TRACE, 'M500 0 V70 L540 110 H700'],
    [TRACE, 'M250 227 H330 L370 187 H460'],
    [TRACE, 'M0 470 H30 L70 430 H130'],
    [TRACE, 'M560 200 H640 L680 160 H780'],
    [TRACE, 'M0 560 H90 L130 520 H260'],
    [TRACE, 'M380 300 H520 L560 340 H640'],
  ],
  pads: [[300, 76], [232, 46, true], [340, 400, true], [240, 372], [700, 110, true], [460, 187], [130, 430], [560, 200], [780, 160, true], [260, 520], [380, 300], [640, 340, true]],
  chip: {x: 160, y: 200, w: 90, h: 54, pins: [[152, 212, 160, 212], [152, 227, 160, 227], [152, 242, 160, 242], [175, 254, 175, 262], [195, 254, 195, 262], [215, 254, 215, 262], [235, 254, 235, 262]]},
  pulses: [['M500 0 V70 L540 110 H700', 9, 29], ['M0 300 H60 L120 360 H300 L340 400', 21, 34],
    ['M0 140 H120 L200 60 H380 L420 20 V0', 2, 25], ['M560 200 H640 L680 160 H780', 14, 24]],
};

function Corner({art, className, shift = 0}) {
  return <svg className={`lch-corner ${className}`} viewBox="0 0 800 600" preserveAspectRatio="xMinYMin meet" aria-hidden="true" focusable="false">
    {art.traces.map(([c, d], i) => <path key={i} className={c} d={d}/>)}
    <rect className="lch-chip" x={art.chip.x} y={art.chip.y} width={art.chip.w} height={art.chip.h}/>
    {art.chip.pins.map(([x1, y1, x2, y2], i) => <line key={i} className="lch-trace" x1={x1} y1={y1} x2={x2} y2={y2}/>)}
    {art.pads.map(([x, y, hi], i) => <Pad key={i} x={x} y={y} hi={hi}/>)}
    {art.pulses.map(([d, delay, dur], i) => <Pulse key={i} d={d} delay={delay + shift} dur={dur}/>)}
  </svg>;
}

function CircuitCorners() {
  return <div className="lch-circuit" aria-hidden="true">
    <Corner art={A} className="is-tl"/>
    <Corner art={B} className="is-tr" shift={5}/>
    <Corner art={B} className="is-bl" shift={12}/>
    <Corner art={A} className="is-br" shift={7}/>
  </div>;
}

export default memo(CircuitCorners);
