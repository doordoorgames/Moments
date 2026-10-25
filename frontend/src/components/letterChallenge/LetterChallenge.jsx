import React, {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import monitorArt from './assets/monitor.webp';
import arrowArt from '../letterTv/assets/ui/arrow.webp';
import panelArt from '../letterTv/assets/ui/panel.webp';
import pillArt from '../letterTv/assets/ui/pill.webp';
import cardArt from '../letterTv/assets/ui/card.webp';
import './letterChallenge.css';

// Letter Challenge: one wide yellow monitor over a slowly spinning purple / powder-lilac / black
// checkerboard. Same controls as Letter TV (back triangle, PLAY ONLINE pill, green NEXT panel).
// Shell only for now: the rules and gameplay go onto the screen next.

// Same warm-up as Letter TV: fetch and decode the art as soon as the game opens.
const warmed = [];
function warmArt() {
  if (warmed.length) return;
  [monitorArt, cardArt, panelArt, pillArt, arrowArt].forEach(src => {
    const img = new Image(); img.decoding = 'async'; img.src = src; warmed.push(img);
    img.decode?.().catch(() => {});
  });
}

export default function LetterChallenge({onContinue}) {
  const navigate = useNavigate();
  useEffect(() => { warmArt(); }, []);
  const exit = () => { if (onContinue) onContinue(); else navigate('/#mini-games'); };
  const lockLandscape = async () => {
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); await window.screen?.orientation?.lock?.('landscape'); } catch { /* not supported */ }
  };

  return <main className="lch-app" data-typography-ignore data-status-bar-color="#0d0b10">
    <div className="lch-checks" aria-hidden="true"><div className="lch-checks-spin"/></div>

    <div className="lch-stage">
      <div className="lch-monitor">
        <img src={monitorArt} alt="" width={2137} height={627} draggable={false}/>
        <div className="lch-screen" aria-live="polite"/>
      </div>
      <button type="button" className="lch-next" disabled style={{backgroundImage: `url(${panelArt})`}}><span>NEXT</span></button>
    </div>

    <button type="button" className="lch-back" aria-label="Back to mini games" onClick={exit}><img src={arrowArt} alt="" draggable={false}/></button>
    <button type="button" className="lch-online" disabled style={{backgroundImage: `url(${pillArt})`}}><span>PLAY ONLINE</span></button>

    <div className="lch-rotate" onClick={lockLandscape}><div><span className="lch-rotate-icon" aria-hidden="true"/><strong>ROTATE YOUR PHONE</strong></div></div>
  </main>;
}
