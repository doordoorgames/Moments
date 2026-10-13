import { lazy } from "react";
import BaccaratHunt from "./BaccaratHunt";
import PackingChallenge from "../shoug2/PackingChallenge";

const BaccaratAdventureEntry = lazy(() => import("../baccaratAdventure/BaccaratAdventureEntry"));

// Rollback switch: set to false and "The Baccarat Hunt" card opens the classic
// one-screen game again. The classic stays reachable at /mini-games/baccarat-classic.
export const BACCARAT_ADVENTURE_ENABLED = true;

export const miniGames = [
  BACCARAT_ADVENTURE_ENABLED
    ? { id: "baccarat-hunt", name: "The Baccarat Hunt", description: "Golden hour at Bicester Village. Play together: steer Shoug, dodge Sharifa, find Shaheen's perfume.", component: BaccaratAdventureEntry }
    : { id: "baccarat-hunt", name: "The Baccarat Hunt", description: "Find the perfume before time runs out in Bicester Village.", component: BaccaratHunt },
  { id: "packing-challenge", name: "The Packing Challenge", description: "Memorise the list and grab your essentials from the airport belt.", component: PackingChallenge },
  { id: "baccarat-classic", name: "The Baccarat Hunt: Classic", description: "The original one-screen perfume dash.", component: BaccaratHunt, hidden: true },
];
