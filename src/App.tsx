import { useEffect, useRef, useState } from "react";
import { GameEngine } from "./game/engine";
import { sound } from "./game/audio";
import { getHighScores, addHighScore, getBest } from "./game/highscores";
import type { HighScore } from "./game/highscores";
import type { ViewState } from "./game/engine";
import GameUI from "./components/Overlays";

export default function App() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [view, setView] = useState<ViewState>("menu");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => getBest());
  const [highScores, setHighScores] = useState<HighScore[]>(() => getHighScores());
  const [newBest, setNewBest] = useState(false);
  const [muted, setMuted] = useState(false);

  // keep a ref to mute so keyboard handler reads latest
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, {
      onViewChange: (v) => {
        setView(v);
        if (v === "playing") {
          setScore(0);
          setNewBest(false);
        }
      },
      onScore: (s) => {
        setScore(s);
        setBest((b) => Math.max(b, s));
      },
      onGameOver: (s) => {
        const prev = getBest();
        const { scores } = addHighScore(s);
        setHighScores(scores);
        setBest(Math.max(s, prev));
        setNewBest(s > prev && s > 0);
      },
    });
    engineRef.current = engine;
    engine.resize();
    engine.start();

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const ro = new ResizeObserver(onResize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W" || k === "Enter") {
        e.preventDefault();
        engine.flap();
      } else if (k === "p" || k === "P" || k === "Escape") {
        e.preventDefault();
        engine.togglePause();
      } else if (k === "m" || k === "M") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);

    const onVis = () => {
      if (document.hidden) engine.togglePause();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      engine.destroy();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    sound.setMuted(next);
  }

  const onPointer = (e: React.PointerEvent) => {
    // Only the primary button / touch / pen.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    engineRef.current?.flap();
  };

  const onStart = () => engineRef.current?.flap();
  const onRestart = () => engineRef.current?.flap();
  const onResume = () => engineRef.current?.resume();
  const onPause = () => engineRef.current?.togglePause();
  const onMenu = () => engineRef.current?.goMenu();

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[#150a2e]">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,#3a1f72_0%,#1a0e3a_55%,#0c0620_100%)]" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />

      <div
        ref={wrapRef}
        onPointerDown={onPointer}
        onContextMenu={(e) => e.preventDefault()}
        className="relative z-10 overflow-hidden rounded-[26px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
        style={{
          aspectRatio: "400 / 711",
          height: "min(100dvh, calc(100vw * 1.7775))",
          maxWidth: "100vw",
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
        />
        <GameUI
          view={view}
          score={score}
          best={best}
          highScores={highScores}
          newBest={newBest}
          muted={muted}
          onStart={onStart}
          onRestart={onRestart}
          onResume={onResume}
          onPause={onPause}
          onMenu={onMenu}
          onToggleMute={toggleMute}
        />
      </div>
    </div>
  );
}
