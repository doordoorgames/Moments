import { Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { miniGames } from "./config";
import "./MiniGames.css";

export function MiniGamesList() {
  const navigate = useNavigate();
  return <section className="mini-games" data-typography-ignore id="mini-games" aria-labelledby="mini-games-title">
    <h2 id="mini-games-title">Mini games</h2>
    <div className="mini-games-list">{miniGames.filter(game => !game.hidden).map(game => <article className="mini-game-card" key={game.id}>
      <h3>{game.name}</h3>{game.subtitle && <p className="mini-game-subtitle" lang="ar" dir="rtl">{game.subtitle}</p>}<p>{game.description}</p>
      <button aria-label={`Play ${game.name}`} onClick={() => navigate(`/mini-games/${game.id}`)}>Play</button>
    </article>)}</div>
  </section>;
}

export default function SoloMiniGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const game = miniGames.find(entry => entry.id === gameId);
  if (!game) return <main className="mini-games"><h1>Game unavailable</h1><button onClick={() => navigate("/")}>Back to mini games</button></main>;
  const Game = game.component;
  return <Suspense fallback={<main className="mini-games" aria-busy="true"><p>Loading {game.name}...</p></main>}>
    <Game continueLabel="Back to mini games" onContinue={() => navigate("/#mini-games")} />
  </Suspense>;
}
