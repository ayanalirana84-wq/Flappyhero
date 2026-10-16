import type { ReactNode } from "react";
import type { HighScore } from "../game/highscores";
import type { ViewState } from "../game/engine";

interface Props {
  view: ViewState;
  score: number;
  best: number;
  highScores: HighScore[];
  newBest: boolean;
  muted: boolean;
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onPause: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
}

type IconProps = { className?: string };

const IconPlay = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
);
const IconPause = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="5" width="4" height="14" rx="1.4" />
    <rect x="14" y="5" width="4" height="14" rx="1.4" />
  </svg>
);
const IconSoundOn = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a9 9 0 0 1 0 12" />
  </svg>
);
const IconSoundOff = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </svg>
);
const IconRestart = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 4v5h-5" />
  </svg>
);
const IconHome = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9h12v-9" />
  </svg>
);
const IconTrophy = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    <path d="M9 14h6l-1 4h-4l-1-4ZM10 21h4" />
  </svg>
);

function medalColor(i: number) {
  if (i === 0) return "from-yellow-300 to-amber-500 text-amber-900";
  if (i === 1) return "from-zinc-200 to-zinc-400 text-zinc-800";
  if (i === 2) return "from-orange-300 to-orange-600 text-orange-950";
  return "from-white/15 to-white/5 text-white/70";
}

function relTime(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HighScoreList({ scores, highlight }: { scores: HighScore[]; highlight?: number }) {
  return (
    <div className="w-full space-y-1.5">
      {scores.length === 0 && (
        <p className="py-3 text-center text-sm text-white/50">No scores yet — be the first!</p>
      )}
      {scores.map((s, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
            i === highlight
              ? "bg-amber-400/25 ring-1 ring-amber-300/60"
              : "bg-white/5"
          }`}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-extrabold ${medalColor(
              i
            )}`}
          >
            {i + 1}
          </div>
          <div className="flex-1 font-pixel text-sm text-white">{s.score}</div>
          <div className="text-xs text-white/45">{relTime(s.date)}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`glass anim-pop pointer-events-none w-[88%] max-w-[340px] rounded-3xl px-6 py-6 shadow-2xl ${className}`}
    >
      {children}
    </div>
  );
}

export default function GameUI(props: Props) {
  const { view, score, best, highScores, newBest, muted } = props;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* ---------- HUD ---------- */}
      {(view === "playing" || view === "paused") && (
        <div className="flex items-start justify-between p-3 sm:p-4">
          <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold text-white">
            <IconTrophy className="h-4 w-4 text-amber-300" />
            {best}
          </div>
          <div className="flex gap-2">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                props.onToggleMute();
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="btn-ghost pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white"
            >
              {muted ? <IconSoundOff className="h-5 w-5" /> : <IconSoundOn className="h-5 w-5" />}
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                props.onPause();
              }}
              aria-label="Pause"
              className="btn-ghost pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white"
            >
              <IconPause className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- center overlays ---------- */}
      <div className="flex flex-1 items-center justify-center">
        {view === "menu" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/55" />
            <div className="relative z-10 flex flex-col items-center gap-5 px-4">
              <h1 className="font-pixel text-grad anim-float text-center text-[26px] leading-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.35)] sm:text-3xl">
                FLAP HERO
              </h1>
              <p className="text-center text-sm font-semibold text-white/80">
                A neon bird. One tiny flap at a time.
              </p>
              <Panel className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-amber-200">
                  <IconTrophy className="h-5 w-5" />
                  <span className="font-pixel text-base">BEST {best}</span>
                </div>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onStart();
                  }}
                  className="btn-primary anim-pulse-glow pointer-events-auto flex items-center gap-2 rounded-2xl px-8 py-3 text-lg font-extrabold"
                >
                  <IconPlay className="h-5 w-5" /> PLAY
                </button>
                <div className="w-full">
                  <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-white/55">
                    Top Flappers
                  </div>
                  <HighScoreList scores={highScores} />
                </div>
              </Panel>
              <p className="text-center text-xs font-medium text-white/60">
                TAP / SPACE to flap &nbsp;·&nbsp; P to pause
              </p>
            </div>
          </div>
        )}

        {view === "paused" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/55" />
            <Panel className="flex flex-col items-center gap-4">
              <h2 className="font-pixel text-xl text-grad">PAUSED</h2>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onResume();
                }}
                className="btn-primary pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-lg font-extrabold"
              >
                <IconPlay className="h-5 w-5" /> RESUME
              </button>
              <div className="flex w-full gap-3">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onRestart();
                  }}
                  className="btn-ghost pointer-events-auto flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold"
                >
                  <IconRestart className="h-4 w-4" /> Retry
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onMenu();
                  }}
                  className="btn-ghost pointer-events-auto flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold"
                >
                  <IconHome className="h-4 w-4" /> Menu
                </button>
              </div>
            </Panel>
          </div>
        )}

        {view === "dead" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/55 to-black/70" />
            <div className="relative z-10 flex flex-col items-center gap-4 px-4">
              <Panel className="flex flex-col items-center gap-4">
                <h2 className="font-pixel text-2xl text-grad">GAME OVER</h2>
                {newBest && (
                  <div className="shimmer anim-fade-up rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-1 font-pixel text-xs font-bold text-amber-950">
                    ✦ NEW BEST ✦
                  </div>
                )}
                <div className="flex w-full items-end justify-center gap-6">
                  <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                      Score
                    </div>
                    <div className="anim-pop font-pixel text-4xl text-white">{score}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                      Best
                    </div>
                    <div className="font-pixel text-2xl text-amber-300">{best}</div>
                  </div>
                </div>
                <div className="w-full">
                  <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-white/55">
                    Leaderboard
                  </div>
                  <HighScoreList scores={highScores} />
                </div>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onRestart();
                  }}
                  className="btn-primary anim-pulse-glow pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-lg font-extrabold"
                >
                  <IconRestart className="h-5 w-5" /> TAP TO RETRY
                </button>
              </Panel>
              <p className="text-xs font-medium text-white/55">
                or press SPACE / TAP to fly again
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
