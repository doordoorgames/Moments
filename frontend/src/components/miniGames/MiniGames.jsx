import { useNavigate, useParams } from "react-router-dom";
import { miniGames } from "./config";
import "./MiniGames.css";

export function MiniGamesList() {
  const navigate = useNavigate();
  return <section className="mini-games" id="mini-games" aria-labelledby="mini-games-title">
    <h2 id="mini-games-title">Mini games</h2>
    <div className="mini-games-list">{miniGames.map(game => <article className="mini-game-card" key={game.id}>
      <h3>{game.name}</h3><p>{game.description}</p>
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
  return <Game continueLabel="Back to mini games" onContinue={() => navigate("/#mini-games")} />;
}
