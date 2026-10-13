"""Shoug 2.0-only state stored durably in the room's existing JSONB flags.

The versioned envelope is filtered out of public story flags. This keeps the
existing schema and CMS intact; choices never refer to this reserved namespace.
"""
import json
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, ConfigDict, Field, model_validator

PREFIX = "__shoug2_pack_light_v1__:"


class PackLightResult(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    finalScore: int = Field(ge=0, le=100)
    grade: str
    comfortScore: int = Field(ge=0, le=30)
    monochromeScore: int = Field(ge=0, le=30)
    bagWeight: float = Field(ge=4.2, le=100)
    overweight: bool

    @model_validator(mode="after")
    def consistent_score(self):
        grade = ("Excess Baggage" if self.overweight else
                 "Carry-On Icon" if self.finalScore >= 85 else
                 "First Class Energy" if self.finalScore >= 65 else
                 "Gate Change Panic" if self.finalScore >= 45 else "Missed Boarding")
        if self.grade != grade or self.overweight != (self.bagWeight > 23):
            raise ValueError("Grade and overweight status must match the score and bag weight")
        packing = self.finalScore - self.comfortScore - self.monochromeScore
        if not 0 <= packing <= 40 or (self.overweight and packing != 0):
            raise ValueError("Invalid score breakdown")
        return self


def read_pack(room):
    if room.get("presentation") != "shoug2":
        return None
    for flag in room.get("flags") or []:
        if isinstance(flag, str) and flag.startswith(PREFIX):
            return json.loads(flag[len(PREFIX):])
    return None


def story_flags(flags):
    return [f for f in flags or [] if not isinstance(f, str) or not f.startswith(PREFIX)]


def pack_flags(flags, pack):
    return story_flags(flags) + [PREFIX + json.dumps(pack, separators=(",", ":"), sort_keys=True)]


def public_pack(pack, now=None):
    if not pack:
        return None
    now = now or datetime.now(timezone.utc)
    waiting = pack.get("waiting_started_at")
    unlock = datetime.fromisoformat(waiting) + timedelta(seconds=90) if waiting else None
    return {**pack, "done_count": len(set(pack["participants"]) & set(pack["results"])),
            "total_count": len(pack["participants"]),
            "host_continue_at": unlock.isoformat() if unlock else None,
            "host_can_continue": bool(unlock and now >= unlock)}
