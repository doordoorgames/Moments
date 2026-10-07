import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { isShougTale } from "@/components/player/shougVisuals";
import { shougScreenThemes, shougBand } from "./shougPalette";
import PlayerFrame from "@/components/player/PlayerFrame";

export default function Ending({ node, story, code, onPlayAgain, onLeave, isHost }) {
    const shoug = isShougTale(story);
    const themes = shougScreenThemes(node?.id || "ending");
    const band = index => shoug ? shougBand(themes, index) : {};
    return (
        <PlayerFrame code={code} playerName="COMPLETE" taleTheme={isShougTale(story) ? "shoug" : null} themeKey={node?.id || "ending"}>
            <div className="player-panel player-ending">
                <div className="player-ending-badge inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Ending
                </div>
                <h1 {...band(1)} className="player-title mt-5" data-testid="ending-title">
                    MISSION COMPLETE!
                </h1>
                {node?.story_text && (
                    <Card {...band(2)} className="player-story-card">
                        <p className="story-text player-story-text">{node.story_text}</p>
                    </Card>
                )}
                {story?.title && (
                    <div {...band(3)} className="player-from">TRANSMISSION: {story.title}</div>
                )}
                <div className="mt-8 space-y-2">
                    {isHost && (
                        <Button
                            {...band(story?.title ? 4 : 3)} className="player-primary-button"
                            onClick={onPlayAgain}
                            data-testid="ending-play-again-button"
                        >
                            Back to lobby (host)
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        {...band((story?.title ? 4 : 3) + (isHost ? 1 : 0))} className="player-secondary-button"
                        onClick={onLeave}
                        data-testid="ending-back-to-lobby-button"
                    >
                        Leave room
                    </Button>
                </div>
            </div>
        </PlayerFrame>
    );
}
