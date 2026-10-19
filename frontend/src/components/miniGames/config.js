import { lazy } from "react";
import BaccaratHunt from "./BaccaratHunt";
import PackingChallenge from "../shoug2/PackingChallenge";

const ShoppingBalance = lazy(() => import("./shoppingBalance/ShoppingBalance"));

const PlotTwist = lazy(() => import("../plotTwist/PlotTwist"));

const EmojiRooftop = lazy(() => import("../emojiRooftop/EmojiRooftop"));

const BaccaratAdventureEntry = lazy(() => import("../baccaratAdventure/BaccaratAdventureEntry"));

// Rollback switch: set to false and "The Baccarat Hunt" card opens the classic
// one-screen game again. The classic stays reachable at /mini-games/baccarat-classic.
export const BACCARAT_ADVENTURE_ENABLED = true;

export const miniGames = [
  BACCARAT_ADVENTURE_ENABLED
    ? { id: "baccarat-hunt", name: "The Baccarat Hunt", description: "Golden hour at Bicester Village. Play together: steer Shoug, dodge Sharifa, find Shaheen's perfume.", component: BaccaratAdventureEntry }
    : { id: "baccarat-hunt", name: "The Baccarat Hunt", description: "Find the perfume before time runs out in Bicester Village.", component: BaccaratHunt },
  // The same hunt, fully in Kuwaiti Arabic. Rooms made here play in Arabic on every phone.
  ...(BACCARAT_ADVENTURE_ENABLED ? [{ id: "attar-shaheen", name: "عطر شاهين", lang: "ar", play: "العب", description: "العصرية في بيستر فيليج. امشوا مع شوق، لا تردون على شريفة، ولقوا عطر أم شاهين.", component: BaccaratAdventureEntry, props: { lang: "ar" } }] : []),
  { id: "packing-challenge", name: "The Packing Challenge", description: "Memorise the list and grab your essentials from the airport belt.", component: PackingChallenge },
  { id: "shopping-balance", name: "Shopping Balance", description: "Oxford Street, too many bags. When Shoug tips, tap the other way. Survive 45 seconds.", component: ShoppingBalance },
  { id: "emoji-rooftop", name: "Emoji Rooftop", description: "Night rooftop, party table, one tablet going around. Guess the movie, country or food from the emojis. Fastest typer wins. 2–12 players.", component: EmojiRooftop },
  { id: "plot-twist", name: "PLOT TWIST", description: "Experimental · A sunset rooftop, your friends, and one ridiculous story. Story Time or Word Trap. 2–8 players.", component: PlotTwist },
  { id: "baccarat-classic", name: "The Baccarat Hunt: Classic", description: "The original one-screen perfume dash.", component: BaccaratHunt, hidden: true },
];
