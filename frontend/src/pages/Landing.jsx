import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, PlayCircle, Wrench } from "lucide-react";

export default function Landing() {
    const nav = useNavigate();
    return (
        <div className="min-h-screen bg-background">
            <div
                className="relative overflow-hidden"
                style={{
                    background:
                        "radial-gradient(1200px circle at 50% -10%, hsl(34 92% 85% / 0.55), transparent 55%), radial-gradient(900px circle at 20% 10%, hsl(18 78% 70% / 0.25), transparent 60%)",
                }}
            >
                <div className="mx-auto max-w-3xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
                    <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                        <Sparkles className="h-3.5 w-3.5" /> Multiplayer branching storytelling engine
                    </div>
                    <h1
                        className="mt-6 text-4xl font-semibold sm:text-5xl lg:text-6xl"
                        style={{ fontFamily: "var(--font-serif)", letterSpacing: "var(--tracking-tight)" }}
                    >
                        Tales, told together.
                    </h1>
                    <p className="mt-4 max-w-xl text-base text-muted-foreground">
                        A room. A code. Five phones. One story. Choose your own path, meet up at the next gate,
                        and vote on where the tale goes next.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Button
                            size="lg"
                            className="h-12 gap-2 text-base"
                            onClick={() => nav("/play")}
                            data-testid="landing-play-button"
                        >
                            <PlayCircle className="h-5 w-5" /> Play a story
                        </Button>
                        <Button
                            size="lg"
                            variant="secondary"
                            className="h-12 gap-2 text-base"
                            onClick={() => nav("/admin")}
                            data-testid="landing-admin-button"
                        >
                            <Wrench className="h-5 w-5" /> Story architect (admin)
                        </Button>
                    </div>
                </div>
            </div>
            <div className="mx-auto max-w-3xl px-6 py-12">
                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        {
                            title: "Independent paths",
                            body: "Each player chooses on their own phone. Same story, different threads.",
                        },
                        {
                            title: "Location gates",
                            body: "Some moments demand the group. No one continues until everyone arrives.",
                        },
                        {
                            title: "Group votes",
                            body: "Big decisions? Majority rules. Live tally, instant resolution.",
                        },
                    ].map((f) => (
                        <div
                            key={f.title}
                            className="rounded-[var(--radius-lg)] border border-border bg-card p-5"
                        >
                            <div className="text-sm font-semibold">{f.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{f.body}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
