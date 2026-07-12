import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import PlayJoin from "@/pages/PlayJoin";
import PlayRoom from "@/pages/PlayRoom";
import AdminLogin from "@/pages/AdminLogin";
import AdminStories from "@/pages/AdminStories";
import AdminCanvas from "@/pages/AdminCanvas";

function AdminGate({ children }) {
    const token = localStorage.getItem("admin_token");
    if (!token) return <Navigate to="/admin" replace />;
    return children;
}

function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Landing />} />
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
        </div>
    );
}

export default App;
