import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Wrench, ArrowLeft } from "lucide-react";

export default function AdminLogin() {
    const nav = useNavigate();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await api.adminLogin(password.trim());
            localStorage.setItem("admin_token", res.token);
            toast.success("Welcome, story architect.");
            nav("/admin/stories");
        } catch (err) {
            toast.error(
                err?.response?.data?.detail ||
                    "Invalid password. Dev password is exactly: admin123",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="dark min-h-screen bg-gradient-to-br from-violet-950 via-fuchsia-950 to-rose-950 text-foreground">
            <div className="mx-auto max-w-sm px-4 pt-16 pb-24 sm:px-6">
                <button
                    onClick={() => nav("/")}
                    className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    data-testid="admin-back-button"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to home
                </button>
                <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs uppercase tracking-widest text-secondary-foreground">
                    <Wrench className="h-3.5 w-3.5" /> Story Architect
                </div>
                <h1 className="mt-4 text-2xl font-semibold">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">Enter the admin password.</p>
                <Card className="mt-6 rounded-[var(--radius-lg)] border-rose-900/50 bg-rose-950/60 p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                className="h-10"
                                data-testid="admin-login-password-input"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={busy}
                            className="h-10 w-full"
                            data-testid="admin-login-submit-button"
                        >
                            Sign in
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                            Dev password:{" "}
                            <button
                                type="button"
                                onClick={() => setPassword("admin123")}
                                className="font-mono text-foreground underline decoration-dotted underline-offset-2 hover:text-accent"
                                data-testid="admin-login-fill-dev-password"
                            >
                                admin123
                            </button>{" "}
                            (click to fill)
                        </p>
                    </form>
                </Card>
            </div>
        </div>
    );
}
