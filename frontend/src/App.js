import "@/App.css";
import { lazy, Suspense, useEffect } from "react";
import MomentsTypography from "@/components/typography/MomentsTypography";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import PlayJoin from "@/pages/PlayJoin";
import PlayRoom from "@/pages/PlayRoom";
import AdminLogin from "@/pages/AdminLogin";
import AdminStories from "@/pages/AdminStories";
import AdminEmojiClues from "@/pages/AdminEmojiClues";
import AdminCanvas from "@/pages/AdminCanvas";
import ShougVillagePrototype from "@/pages/ShougVillagePrototype";

import SoloMiniGame from "@/components/miniGames/MiniGames";

const PlotTwist = lazy(() => import("@/components/plotTwist/PlotTwist"));
const EmojiRooftop = lazy(() => import("@/components/emojiRooftop/EmojiRooftop"));
const LetterTV = lazy(() => import("@/components/letterTv/LetterTV"));

const BaccaratAdventureRoom = lazy(() => import("@/components/baccaratAdventure/BaccaratAdventureRoom"));

function AdminGate({ children }) {
    const token = localStorage.getItem("admin_token");
    if (!token) return <Navigate to="/admin" replace />;
    return children;
}

function StatusBarTheme() {
    const location = useLocation();
    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const choose = () => {
            const path = window.location.pathname;
            const palette = path.includes('plot-twist') ? '#352039'
                : path.includes('emoji-rooftop') ? '#120c28'
                : path.includes('letter-tv') ? '#000000'
                : path.includes('letter-challenge') ? '#000000'
                : path.includes('baccarat') ? '#000000'
                : path.includes('shoug') ? '#6E1F35'
                : path.includes('admin') ? '#FBF4E4'
                : '#392781';
            // Prefer a page-provided theme when present; otherwise use the route palette.
            const screen = document.querySelector('[data-status-bar-color]');
            const color = screen?.getAttribute('data-status-bar-color') || palette;
            if (meta.content !== color) meta.content = color;
        };
        choose();
        const observer = new MutationObserver(choose);
        observer.observe(document.getElementById('root'), {subtree:true,childList:true,attributes:true,attributeFilter:['data-status-bar-color','class','style']});
        return () => observer.disconnect();
    }, [location.pathname]);
    return null;
}
function App() {
    return (
        <MomentsTypography><div className="App">
            <BrowserRouter>
                <StatusBarTheme />
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/mini-games/baccarat-hunt/room/:code" element={<Suspense fallback={null}><BaccaratAdventureRoom /></Suspense>} />
                    <Route path="/mini-games/emoji-rooftop/room/:code" element={<Suspense fallback={null}><EmojiRooftop /></Suspense>} />
                    <Route path="/mini-games/letter-tv/room/:code" element={<Suspense fallback={null}><LetterTV /></Suspense>} />
                    <Route path="/mini-games/plot-twist/room/:code" element={<Suspense fallback={null}><PlotTwist /></Suspense>} />
                    <Route path="/mini-games/:gameId" element={<SoloMiniGame />} />
                    <Route path="/visual-test" element={<Navigate to="/" replace />} />
                    <Route path="/shoug-2" element={<ShougVillagePrototype />} />
                    <Route path="/shoug-2/room/:code" element={<PlayRoom shoug2 />} />
                    <Route path="/play" element={<PlayJoin />} />
                    <Route path="/play/:code" element={<PlayRoom />} />
                    <Route path="/admin" element={<AdminLogin />} />
                    <Route
                        path="/admin/stories"
                        element={
                            <AdminGate>
                                <AdminStories />
                            </AdminGate>
                        }
                    />
                    <Route
                        path="/admin/emoji-clues"
                        element={
                            <AdminGate>
                                <AdminEmojiClues />
                            </AdminGate>
                        }
                    />
                    <Route
                        path="/admin/stories/:id"
                        element={
                            <AdminGate>
                                <AdminCanvas />
                            </AdminGate>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
            <Toaster position="top-center" richColors />
        </div></MomentsTypography>
    );
}

export default App;
