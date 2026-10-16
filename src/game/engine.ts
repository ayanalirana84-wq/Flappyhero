import { sound } from "./audio";

export type ViewState = "menu" | "playing" | "paused" | "dead";

export interface EngineCallbacks {
  onViewChange?: (v: ViewState) => void;
  onScore?: (s: number) => void;
  onGameOver?: (s: number) => void;
}

// ---- Virtual resolution (portrait). Everything is computed in these units
// and scaled to the actual canvas size at draw time, so physics feel
// identical on every screen. ----
export const BASE_W = 400;
export const BASE_H = 711;
const GROUND_H = 104;

const BIRD_X = 118;
const BIRD_R = 15;
const PIPE_W = 66;
const PIPE_SPACING = 232; // horizontal distance between pipes
const GRAVITY = 1500;
const FLAP_V = -430;
const BASE_SPEED = 162;
const MAX_SPEED = 280;
const BASE_GAP = 196;
const MIN_GAP = 150;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Pipe {
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  rot: number;
  spin: number;
  shape: "circle" | "rect" | "feather" | "star";
}

interface Cloud {
  x: number;
  y: number;
  s: number;
  p: number; // parallax factor
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;
  private raf = 0;
  private last = 0;
  private running = false;

  private view: ViewState = "menu";
  private score = 0;
  private best = 0;

  // bird
  private by = BASE_H / 2;
  private bvy = 0;
  private bAngle = 0;
  private squash = 0;
  private wing = 0;
  private bob = 0; // menu idle bob phase

  // world
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private clouds: Cloud[] = [];
  private groundScroll = 0;
  private bgScroll = 0;
  private speed = BASE_SPEED;
  private shake = 0;
  private flash = 0;
  private deadAt = 0;
  private deathLanded = false;

  private dpr = 1;
  private scale = 1;
  private skyGrad: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.cb = cb;
    this.initClouds();
    this.resize();
  }

  // ---------- lifecycle ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 1 / 30) dt = 1 / 30; // clamp to avoid tunneling
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.scale = this.canvas.width / BASE_W;
    // rebuild sky gradient in device pixels
    const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, "#2a1a5e");
    g.addColorStop(0.32, "#5b3aa6");
    g.addColorStop(0.55, "#b5468f");
    g.addColorStop(0.78, "#f6845c");
    g.addColorStop(1, "#ffd27a");
    this.skyGrad = g;
  }

  // ---------- input ----------
  flap() {
    sound.unlock();
    if (this.view === "menu") {
      this.reset();
      this.view = "playing";
      this.cb.onViewChange?.(this.view);
      this.applyFlap();
    } else if (this.view === "playing") {
      this.applyFlap();
    } else if (this.view === "dead") {
      if (performance.now() - this.deadAt > 260) {
        this.reset();
        this.view = "playing";
        this.cb.onViewChange?.(this.view);
        this.applyFlap();
      }
    }
  }

  private applyFlap() {
    this.bvy = FLAP_V;
    this.squash = 1;
    this.wing = 1;
    this.bAngle = Math.min(this.bAngle, -0.35);
    sound.play("flap");
    this.spawnFlapPuff();
  }

  togglePause() {
    if (this.view === "playing") {
      this.view = "paused";
      this.cb.onViewChange?.(this.view);
    } else if (this.view === "paused") {
      this.view = "playing";
      this.last = performance.now();
      this.cb.onViewChange?.(this.view);
    }
  }

  resume() {
    if (this.view === "paused") this.togglePause();
  }

  goMenu() {
    if (this.view === "menu") return;
    this.view = "menu";
    this.score = 0;
    this.pipes = [];
    this.particles = [];
    this.by = BASE_H * 0.46;
    this.bvy = 0;
    this.bAngle = 0;
    this.squash = 0;
    this.wing = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathLanded = false;
    this.cb.onViewChange?.(this.view);
  }

  private reset() {
    this.score = 0;
    this.best = 0;
    this.by = BASE_H * 0.46;
    this.bvy = 0;
    this.bAngle = 0;
    this.squash = 0;
    this.wing = 0;
    this.pipes = [];
    this.particles = [];
    this.speed = BASE_SPEED;
    this.shake = 0;
    this.flash = 0;
    this.deathLanded = false;
    this.groundScroll = 0;
    // seed first pipes off-screen to the right
    this.spawnPipe(BASE_W + 90);
    this.spawnPipe(BASE_W + 90 + PIPE_SPACING);
  }

  // ---------- spawning ----------
  private initClouds() {
    const n = 6;
    for (let i = 0; i < n; i++) {
      this.clouds.push({
        x: rand(0, BASE_W),
        y: rand(40, 360),
        s: rand(0.7, 1.5),
        p: rand(0.08, 0.32),
      });
    }
  }

  private spawnPipe(x: number) {
    const gap = Math.max(MIN_GAP, BASE_GAP - this.score * 1.6);
    const minC = gap / 2 + 64;
    const maxC = BASE_H - GROUND_H - gap / 2 - 64;
    const gapY = rand(minC, maxC);
    this.pipes.push({ x, gapY, gap, scored: false });
  }

  // ---------- update ----------
  private update(dt: number) {
    // background always drifts a little
    const worldSpeed = this.view === "playing" ? this.speed : this.view === "menu" ? 46 : this.view === "dead" ? this.speed * 0.35 : 0;
    this.bgScroll += worldSpeed * dt;
    for (const c of this.clouds) {
      c.x -= worldSpeed * c.p * dt;
      if (c.x < -120) {
        c.x = BASE_W + rand(20, 140);
        c.y = rand(40, 360);
      }
    }
    this.groundScroll = (this.groundScroll + worldSpeed * dt) % 48;

    if (this.view === "menu") {
      this.bob += dt * 2.4;
      this.by = BASE_H * 0.46 + Math.sin(this.bob) * 10;
      this.wing = Math.max(0, this.wing - dt * 6);
      this.updateParticles(dt);
      return;
    }

    if (this.view === "paused") return;

    if (this.view === "playing") {
      this.bvy += GRAVITY * dt;
      this.by += this.bvy * dt;
      this.wing = Math.max(0, this.wing - dt * 6);
      this.squash = Math.max(0, this.squash - dt * 5);

      // ceiling: soft clamp, no death
      if (this.by < BIRD_R) {
        this.by = BIRD_R;
        if (this.bvy < 0) this.bvy = 0;
      }

      // pipes
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.score * 2.0);
      for (const p of this.pipes) p.x -= this.speed * dt;

      // spawn
      const last = this.pipes[this.pipes.length - 1];
      if (!last || last.x < BASE_W - PIPE_SPACING) {
        this.spawnPipe(BASE_W + 40);
      }
      // recycle
      if (this.pipes.length && this.pipes[0].x < -PIPE_W - 20) {
        this.pipes.shift();
      }

      // scoring + collision
      for (const p of this.pipes) {
        if (!p.scored && p.x + PIPE_W / 2 < BIRD_X) {
          p.scored = true;
          this.score += 1;
          this.cb.onScore?.(this.score);
          sound.play("score");
          this.shake = Math.max(this.shake, 4.5);
          this.flash = 0.5;
          this.spawnScoreSparkle(p.gapY);
        }
        if (this.hitsPipe(p)) {
          this.die();
          break;
        }
      }

      // ground death
      if (this.by + BIRD_R >= BASE_H - GROUND_H) {
        this.by = BASE_H - GROUND_H - BIRD_R;
        this.die();
      }
    } else if (this.view === "dead") {
      // bird tumbles to ground, pipes frozen
      if (!this.deathLanded) {
        this.bvy += GRAVITY * dt;
        this.by += this.bvy * dt;
        if (this.by + BIRD_R >= BASE_H - GROUND_H) {
          this.by = BASE_H - GROUND_H - BIRD_R;
          this.deathLanded = true;
          this.bvy = 0;
          this.shake = Math.max(this.shake, 7);
          this.spawnFeathers(this.by - 6);
        }
      }
      this.wing = Math.max(0, this.wing - dt * 6);
    }

    // angle from velocity
    const target = clamp(this.bvy * 0.0011, -0.5, 1.45);
    this.bAngle = lerp(this.bAngle, target, 1 - Math.pow(0.001, dt));

    this.updateParticles(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 38);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  private hitsPipe(p: Pipe): boolean {
    const r = BIRD_R - 2;
    const topH = p.gapY - p.gap / 2;
    const botY = p.gapY + p.gap / 2;
    // body rect of pipe (no cap overhang)
    if (
      this.circleRect(BIRD_X, this.by, r, p.x, 0, PIPE_W, topH) ||
      this.circleRect(BIRD_X, this.by, r, p.x, botY, PIPE_W, BASE_H - GROUND_H - botY)
    ) {
      return true;
    }
    // caps (wider): top cap at bottom of top pipe, bottom cap at top of bottom pipe
    const capW = PIPE_W + 14;
    const capX = p.x - 7;
    const capH = 26;
    if (
      this.circleRect(BIRD_X, this.by, r, capX, topH - capH, capW, capH) ||
      this.circleRect(BIRD_X, this.by, r, capX, botY, capW, capH)
    ) {
      return true;
    }
    return false;
  }

  private circleRect(
    cx: number,
    cy: number,
    r: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): boolean {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  private die() {
    if (this.view !== "playing") return;
    this.view = "dead";
    this.deadAt = performance.now();
    this.best = Math.max(this.best, this.score);
    this.shake = Math.max(this.shake, 16);
    sound.play("hit");
    window.setTimeout(() => sound.play("die"), 90);
    this.cb.onViewChange?.(this.view);
    this.cb.onGameOver?.(this.score);
  }

  // ---------- particles ----------
  private updateParticles(dt: number) {
    const arr = this.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) arr.splice(i, 1);
    }
    if (arr.length > 260) arr.splice(0, arr.length - 260);
  }

  private pushParticle(p: Particle) {
    if (this.particles.length > 260) return;
    this.particles.push(p);
  }

  private spawnFlapPuff() {
    for (let i = 0; i < 6; i++) {
      this.pushParticle({
        x: BIRD_X - 10,
        y: this.by + rand(-6, 8),
        vx: rand(-50, -10),
        vy: rand(-20, 30),
        life: rand(0.25, 0.5),
        maxLife: 0.5,
        size: rand(3, 6),
        color: "rgba(255,255,255,0.9)",
        gravity: 30,
        rot: 0,
        spin: 0,
        shape: "circle",
      });
    }
  }

  private spawnScoreSparkle(gy: number) {
    const colors = ["#ffe27a", "#fff6c8", "#ffb347", "#9bffb0"];
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 220);
      this.pushParticle({
        x: BIRD_X,
        y: gy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.4, 0.8),
        maxLife: 0.8,
        size: rand(3, 7),
        color: colors[i % colors.length],
        gravity: 120,
        rot: rand(0, 6),
        spin: rand(-8, 8),
        shape: i % 3 === 0 ? "star" : "circle",
      });
    }
  }

  private spawnFeathers(y: number) {
    const colors = ["#ffd84d", "#ff9f43", "#ff6b6b", "#ffe9a8"];
    for (let i = 0; i < 26; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(80, 320);
      this.pushParticle({
        x: BIRD_X,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: rand(0.6, 1.3),
        maxLife: 1.3,
        size: rand(4, 9),
        color: colors[i % colors.length],
        gravity: 520,
        rot: rand(0, 6),
        spin: rand(-10, 10),
        shape: "feather",
      });
    }
  }

  // ---------- render ----------
  private render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // shake offset (device px)
    const sx = (Math.random() * 2 - 1) * this.shake * this.scale;
    const sy = (Math.random() * 2 - 1) * this.shake * this.scale;

    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.fillStyle = this.skyGrad || "#5b3aa6";
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // scale into virtual space
    ctx.setTransform(this.scale, 0, 0, this.scale, sx, sy);

    this.drawSun();
    this.drawClouds();
    for (const p of this.pipes) this.drawPipe(p);
    this.drawBird();
    this.drawGround();
    this.drawParticles();

    // score (during play / paused)
    if (this.view === "playing" || this.view === "paused") {
      this.drawScore(this.score);
    }

    // flash overlay
    if (this.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawSun() {
    const ctx = this.ctx;
    const x = BASE_W * 0.74;
    const y = BASE_H * 0.26;
    const r = 64;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, "rgba(255,243,200,0.95)");
    g.addColorStop(0.5, "rgba(255,210,120,0.55)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,248,224,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawClouds() {
    const ctx = this.ctx;
    for (const c of this.clouds) {
      const s = c.s;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      this.cloudPath(ctx);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.save();
      ctx.scale(0.7, 0.7);
      ctx.translate(8, 6);
      this.cloudPath(ctx);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }
  }

  private cloudPath(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.arc(22, 4, 14, 0, Math.PI * 2);
    ctx.arc(-22, 4, 14, 0, Math.PI * 2);
    ctx.arc(0, 10, 22, 0, Math.PI * 2);
    ctx.closePath();
  }

  private drawPipe(p: Pipe) {
    const ctx = this.ctx;
    const topH = p.gapY - p.gap / 2;
    const botY = p.gapY + p.gap / 2;
    const capW = PIPE_W + 14;
    const capX = p.x - 7;
    const capH = 26;

    const body = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
    body.addColorStop(0, "#1f8f6d");
    body.addColorStop(0.18, "#39d29a");
    body.addColorStop(0.5, "#27b985");
    body.addColorStop(0.85, "#178a64");
    body.addColorStop(1, "#0f6b4d");

    const cap = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    cap.addColorStop(0, "#1f8f6d");
    cap.addColorStop(0.2, "#3fe0a3");
    cap.addColorStop(0.5, "#27b985");
    cap.addColorStop(0.85, "#178a64");
    cap.addColorStop(1, "#0f6b4d");

    ctx.fillStyle = body;
    ctx.fillRect(p.x, 0, PIPE_W, topH);
    ctx.fillRect(p.x, botY, PIPE_W, BASE_H - GROUND_H - botY);

    // highlight stripe
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(p.x + 8, 0, 7, topH);
    ctx.fillRect(p.x + 8, botY, 7, BASE_H - GROUND_H - botY);

    // caps
    ctx.fillStyle = cap;
    ctx.fillRect(capX, topH - capH, capW, capH);
    ctx.fillRect(capX, botY, capW, capH);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(capX + 9, topH - capH, 7, capH);
    ctx.fillRect(capX + 9, botY, 7, capH);

    // outline
    ctx.strokeStyle = "rgba(8,52,38,0.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, 0, PIPE_W, topH);
    ctx.strokeRect(p.x, botY, PIPE_W, BASE_H - GROUND_H - botY);
    ctx.strokeRect(capX, topH - capH, capW, capH);
    ctx.strokeRect(capX, botY, capW, capH);
  }

  private drawBird() {
    const ctx = this.ctx;
    const sx = 1 + this.squash * 0.22;
    const sy = 1 - this.squash * 0.22;
    ctx.save();
    ctx.translate(BIRD_X, this.by);
    ctx.rotate(this.bAngle);
    ctx.scale(sx, sy);

    // body
    const bg = ctx.createLinearGradient(0, -16, 0, 18);
    bg.addColorStop(0, "#ffe16b");
    bg.addColorStop(0.55, "#ffc23d");
    bg.addColorStop(1, "#ff9a2e");
    ctx.fillStyle = bg;
    ctx.strokeStyle = "#7a3d00";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // belly
    ctx.fillStyle = "rgba(255,248,214,0.85)";
    ctx.beginPath();
    ctx.ellipse(2, 5, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // wing (animated)
    const wingUp = -0.5 * this.wing + Math.sin(performance.now() / 90) * 0.18;
    ctx.save();
    ctx.translate(-2, 1);
    ctx.rotate(wingUp);
    ctx.fillStyle = "#ffb84d";
    ctx.strokeStyle = "#7a3d00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-3, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // crest tuft
    ctx.fillStyle = "#ff6b3d";
    ctx.beginPath();
    ctx.moveTo(-8, -11);
    ctx.lineTo(-13, -17);
    ctx.lineTo(-6, -13);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, -4, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1c28";
    ctx.beginPath();
    ctx.arc(10, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(11, -5.5, 1, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = "#ff7a1a";
    ctx.strokeStyle = "#7a3d00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, -2);
    ctx.lineTo(26, 0);
    ctx.lineTo(15, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawGround() {
    const ctx = this.ctx;
    const gy = BASE_H - GROUND_H;
    // dirt
    const g = ctx.createLinearGradient(0, gy, 0, BASE_H);
    g.addColorStop(0, "#caa15a");
    g.addColorStop(0.18, "#9c6b34");
    g.addColorStop(1, "#5e3c1c");
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, BASE_W, GROUND_H);
    // grass top band
    ctx.fillStyle = "#3ec98a";
    ctx.fillRect(0, gy, BASE_W, 12);
    ctx.fillStyle = "#2aa873";
    ctx.fillRect(0, gy + 12, BASE_W, 5);
    // moving stripes
    ctx.fillStyle = "rgba(94,60,28,0.35)";
    for (let x = -48 - this.groundScroll; x < BASE_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 22);
      ctx.lineTo(x + 16, gy + 22);
      ctx.lineTo(x + 6, gy + GROUND_H);
      ctx.lineTo(x - 8, gy + GROUND_H);
      ctx.closePath();
      ctx.fill();
    }
    // top edge line
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(BASE_W, gy + 0.5);
    ctx.stroke();
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.shape === "star") {
        this.star(ctx, p.size);
      } else {
        // feather: ellipse + quill
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(120,60,0,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private star(ctx: CanvasRenderingContext2D, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawScore(n: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 56px 'Baloo 2', 'Arial Rounded MT Bold', system-ui, sans-serif";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(20,10,40,0.55)";
    ctx.fillStyle = "#fff";
    ctx.strokeText(String(n), BASE_W / 2, 78);
    ctx.fillText(String(n), BASE_W / 2, 78);
    ctx.restore();
  }
}
