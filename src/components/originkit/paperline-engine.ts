// Adapted from the Paperline Archive source supplied by the user (Originkit).
// The brush skeletons, seeded bristles, dry-ink noise and newspaper geometry
// are retained; branding, responsive sizing and the one-shot timeline are Fieldwork's.
export const PAPER = "#F4F2EC",
  INK = "#111111";
const SERIF = "'Times New Roman', Times, serif",
  MONO = "'Courier New', Courier, monospace";
const O =
  "C 0.44 0.03 0.16 0.12 0.05 0.45 0.12 0.8 0.4 0.97 0.68 0.88 0.78 0.55 0.7 0.18 0.46 0.03 0.34 0.08";
const glyphs: Record<string, { w: number; s: string[] }> = {
  F: {
    w: 0.6,
    s: ["L .08 .03 .07 1", "L .08 .03 .58 .02", "L .08 .48 .48 .47"],
  },
  i: { w: 0.24, s: ["L .12 .32 .12 1", "D .115 .03 .125 .13"] },
  E: { w: 0.62, s: ["L .58 .03 .07 .03 .07 .98 .6 .97", "L .08 .5 .5 .49"] },
  L: { w: 0.58, s: ["L .08 .01 .08 .97 .56 .97"] },
  D: {
    w: 0.76,
    s: [
      "L .07 .02 .07 1",
      "C .07 .03 .4 .04 .64 .2 .72 .5 .62 .8 .38 .96 .07 .98",
    ],
  },
  W: { w: 1.06, s: ["L .02 .01 .25 1 .53 .18 .81 1 1.04 .01"] },
  O: { w: 0.82, s: [O] },
  R: {
    w: 0.7,
    s: [
      "L .07 1 .07 .03",
      "C .07 .03 .42 .03 .6 .14 .62 .32 .45 .5 .08 .52",
      "L .3 .52 .68 1",
    ],
  },
  K: { w: 0.7, s: ["L .07 .01 .07 1", "L .66 .02 .08 .6", "L .3 .42 .68 1"] },
};
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
function noise(x: number) {
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x),
    u = sm(x - i);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
type Pt = [number, number];
function densify(kind: string, pts: Pt[]) {
  if (kind !== "C" || pts.length < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) {
      const t = k / 12,
        t2 = t * t,
        t3 = t2 * t;
      out.push(
        [0, 1].map(
          (j) =>
            0.5 *
            (2 * p1[j] +
              (-p0[j] + p2[j]) * t +
              (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
              (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3),
        ) as Pt,
      );
    }
  }
  out.push(pts.at(-1)!);
  return out;
}
type Stroke = {
  x: Float32Array;
  y: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  n: number;
  len: number;
  step: number;
  w: number;
  off: Float32Array;
  rad: Float32Array;
  seed: Float32Array;
  start: number;
  dur: number;
  done: number;
};
function makeStroke(
  dense: Pt[],
  S: number,
  w: number,
  rng: () => number,
): Stroke {
  const B = 24,
    cum = [0];
  for (let i = 1; i < dense.length; i++)
    cum.push(
      cum[i - 1] +
        Math.hypot(
          dense[i][0] - dense[i - 1][0],
          dense[i][1] - dense[i - 1][1],
        ),
    );
  const len = Math.max(cum.at(-1)!, 0.5),
    n = Math.max(2, Math.ceil(len / Math.max(0.8, S / 170)) + 1),
    step = len / (n - 1);
  const x = new Float32Array(n),
    y = new Float32Array(n),
    nx = new Float32Array(n),
    ny = new Float32Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const d = i * step;
    while (seg < dense.length - 2 && cum[seg + 1] < d) seg++;
    const t = clamp((d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1));
    x[i] = dense[seg][0] + (dense[seg + 1][0] - dense[seg][0]) * t;
    y[i] = dense[seg][1] + (dense[seg + 1][1] - dense[seg][1]) * t;
  }
  const k = Math.max(1, Math.round((w * 0.35) / step));
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - k),
      b = Math.min(n - 1, i + k);
    let tx = x[b] - x[a],
      ty = y[b] - y[a];
    const l = Math.hypot(tx, ty);
    if (l < 1e-4) {
      tx = 1;
      ty = 0;
    } else {
      tx /= l;
      ty /= l;
    }
    nx[i] = -ty;
    ny[i] = tx;
  }
  const off = new Float32Array(B),
    rad = new Float32Array(B),
    seed = new Float32Array(B);
  for (let j = 0; j < B; j++) {
    off[j] = (j + 0.5) / B - 0.5 + ((rng() - 0.5) * 0.6) / B;
    let r = (w / B) * (0.55 + rng() * 0.55);
    if (Math.abs(off[j]) > 0.42) r *= 0.75;
    rad[j] = Math.max(0.35, r);
    seed[j] = rng() * 500;
  }
  return {
    x,
    y,
    nx,
    ny,
    n,
    len,
    step,
    w,
    off,
    rad,
    seed,
    start: 0,
    dur: 0,
    done: -1,
  };
}
function paintRange(
  ctx: CanvasRenderingContext2D,
  st: Stroke,
  a: number,
  b: number,
) {
  ctx.strokeStyle = "#050505";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let j = 0; j < 24; j++) {
    const o = st.off[j],
      ao = Math.abs(o);
    ctx.lineWidth = st.rad[j] * 2;
    ctx.beginPath();
    let pen = false;
    for (let i = a; i <= b; i++) {
      const s = i * st.step,
        u = s / st.len;
      let f = 0.6 + 0.4 * sm(s / (0.08 * st.len));
      if (u > 0.9) f *= 1 - 0.18 * sm((u - 0.9) / 0.1);
      const drop =
        0.5 * (0.15 + 0.85 * sm((u - 0.62) / 0.38)) * (0.55 + 1.8 * ao);
      if (noise(st.seed[j] + s / Math.max(2, st.w * 0.9)) <= drop) {
        pen = false;
        continue;
      }
      const wob =
        1 +
        (noise(st.seed[j] * 1.7 + 50 + s / (Math.max(2, st.w * 0.9) * 0.35)) -
          0.5) *
          0.36 *
          ao;
      const d = o * st.w * f * wob,
        px = st.x[i] + st.nx[i] * d,
        py = st.y[i] + st.ny[i] * d;
      if (!pen) {
        ctx.moveTo(px, py);
        ctx.lineTo(px + 0.01, py);
        pen = true;
      } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
function paintEase(x: number) {
  if (x >= 1) return 1;
  let t = x;
  const bx = (t: number) =>
    3 * 0.3 * t * (1 - t) * (1 - t) + 3 * 0.2 * t * t * (1 - t) + t * t * t;
  for (let i = 0; i < 12; i++) {
    const d = (bx(t + 0.0001) - bx(t - 0.0001)) / 0.0002;
    t = clamp(t - (bx(t) - x) / (d || 1));
  }
  return 3 * t * t - 2 * t * t * t;
}
export type PaintedGlyph = { x: number; y: number; halfWidth: number };
export function buildPaint(W: number, H: number) {
  const rng = mulberry(7 * 9973 + 17),
    letters = Array.from("Fieldwork").map((ch) => {
      const g = glyphs[ch] || glyphs[ch.toUpperCase()];
      return {
        g,
        sx: 1 + (rng() - 0.5) * 0.08,
        sy: 1 + (rng() - 0.5) * 0.128,
        rot: ((rng() * 2 - 1) * 4 * Math.PI) / 180,
        dy: (rng() - 0.5) * 0.048,
        ws: Math.floor(rng() * 1e6),
      };
    });
  const width = letters.reduce((w, l) => w + l.g.w * l.sx + 0.06, 0) - 0.06,
    S = Math.min((W * 0.86) / width, H * 0.27),
    left = (W - width * S) / 2,
    top = H * 0.54 - S * 0.5;
  let x = left,
    time = 200;
  const strokes: Stroke[] = [],
    dots: Stroke[] = [];
  const glyphCenters: PaintedGlyph[] = [];
  letters.forEach((lt, li) => {
    const cx = x + (lt.g.w * lt.sx * S) / 2,
      cy = top + S * 0.5 + lt.dy * S,
      cos = Math.cos(lt.rot),
      sin = Math.sin(lt.rot),
      lr = mulberry(lt.ws);
    glyphCenters.push({ x: cx, y: cy, halfWidth: (lt.g.w * lt.sx * S) / 2 });
    if (li) time += 80;
    lt.g.s.forEach((def, si) => {
      const parts = def.split(/\s+/),
        nums = parts.slice(1).map(Number),
        pts: Pt[] = [];
      for (let i = 0; i < nums.length; i += 2) {
        const gx = nums[i] + (lr() - 0.5) * 0.035,
          gy = nums[i + 1] + (lr() - 0.5) * 0.035,
          lx = (gx - lt.g.w / 2) * S * lt.sx,
          ly = (gy - 0.5) * S * lt.sy;
        pts.push([cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]);
      }
      const st = makeStroke(
        densify(parts[0], pts),
        S,
        S * 0.18 * (1 + (lr() - 0.5) * 0.16),
        lr,
      );
      if (parts[0] === "D") {
        dots.push(st);
        return;
      }
      if (si) time += 30;
      st.start = time;
      st.dur = Math.max(120, Math.min(600, st.len / ((1.4 * H) / 1000)));
      time += st.dur;
      strokes.push(st);
    });
    x += (lt.g.w * lt.sx + 0.06) * S;
  });
  for (const st of dots) {
    time += 80;
    st.start = time;
    st.dur = 120;
    time += st.dur;
    strokes.push(st);
  }
  return {
    end: time,
    glyphs: glyphCenters,
    draw(ctx: CanvasRenderingContext2D, t: number) {
      for (const st of strokes) {
        if (t <= st.start) continue;
        const q = Math.min(1, (t - st.start) / st.dur),
          target = q >= 1 ? st.n - 1 : Math.floor(paintEase(q) * (st.n - 1));
        if (target > st.done) {
          paintRange(ctx, st, Math.max(0, st.done), target);
          st.done = target;
        }
      }
    },
  };
}
const HEADS = [
  "FOLLOW THE EVIDENCE",
  "A QUESTION WORTH ASKING",
  "NOTES FROM THE FIELD",
  "THE SOURCE MATTERS",
  "OPEN FOR INQUIRY",
  "READ BEYOND THE HEADLINE",
  "CONTEXT & CONSEQUENCE",
  "RESEARCH, ON RECORD",
  "WHAT REMAINS UNKNOWN",
  "A CLOSER LOOK",
  "THE PUBLIC RECORD",
];
const WORDS =
  "research evidence source question inquiry context public record search findings observation report knowledge uncertainty method analysis archive original pages claims reading reference documented review conversation understanding information careful reasoning study notes facts links date perspective support".split(
    " ",
  );
function justify(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  w: number,
  last = false,
) {
  const words: string[] = [],
    widths: number[] = [];
  const sp = ctx.measureText(" ").width;
  let sum = 0;
  for (let i = 0; i < 35; i++) {
    const wd = WORDS[Math.floor(rng() * WORDS.length)],
      ww = ctx.measureText(wd).width;
    if (sum + sp * words.length + ww > w) break;
    words.push(wd);
    widths.push(ww);
    sum += ww;
  }
  let xx = x;
  const gap = last
    ? sp
    : Math.min(sp * 3, (w - sum) / Math.max(1, words.length - 1));
  for (let i = 0; i < words.length; i++) {
    if (last && i > words.length * 0.55) break;
    ctx.fillText(words[i], xx, y);
    xx += widths[i] + gap;
  }
}
function drawArchiveMasthead(
  ctx: CanvasRenderingContext2D,
  text: string,
  center: number,
  baseline: number,
  size: number,
) {
  ctx.font = `${size}px 'Pirata One', Georgia, serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, center, baseline);
}

export function bakePaper(
  canvas: HTMLCanvasElement,
  W: number,
  H: number,
  dpr: number,
) {
  dpr = Math.min(dpr, 4096 / Math.max(W, H));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const m = Math.max(10, H * 0.02),
    pw = W - 2 * m,
    ph = H - 2 * m,
    U = ph / 1000,
    py = m + 65,
    bot = H - m,
    colL = m + 29 * U,
    colR = W - m - 29 * U,
    rng = mulberry(7 * 7919 + 3);
  ctx.strokeStyle = "#C8C8C8";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(m, m, pw, ph);
  ctx.save();
  ctx.setLineDash([3 * U + 1, 2 * U + 1]);
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(m + 3, m + 3, pw - 6, ph - 6);
  ctx.restore();
  const titleY = py + 100 * U;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawArchiveMasthead(
    ctx,
    "The Fieldwork Archive",
    W / 2,
    titleY,
    Math.min(64 * U, W * 0.085),
  );
  ctx.textAlign = "center";
  if (W > 650) {
    ctx.font = `${8.8 * U}px ${SERIF}`;
    for (const [x, w, text] of [
      [colL, 86 * U, "A record of inquiry"],
      [colR - 95 * U, 95 * U, "The research edition"],
    ] as const) {
      ctx.strokeStyle = INK;
      ctx.strokeRect(x, py + 59 * U, w, 39 * U);
      ctx.fillText(text, x + w / 2, py + 82 * U);
    }
  }
  const r1 = py + 126 * U,
    r2 = py + 146 * U;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.7, U);
  ctx.beginPath();
  ctx.moveTo(colL, r1);
  ctx.lineTo(colR, r1);
  ctx.moveTo(colL, r2);
  ctx.lineTo(colR, r2);
  ctx.stroke();
  ctx.font = `${Math.max(7, 10.5 * U)}px ${SERIF}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("FIELDWORK", colL, (r1 + r2) / 2);
  ctx.textAlign = "center";
  ctx.fillText(
    W > 650 ? "INQUIRY · EVIDENCE · UNDERSTANDING" : "THE RESEARCH EDITION",
    W / 2,
    (r1 + r2) / 2,
  );
  ctx.textAlign = "right";
  if (W > 650) ctx.fillText("OPEN EDITION", colR, (r1 + r2) / 2);
  const top = py + 161 * U,
    avail = colR - colL,
    count = Math.max(3, Math.round(avail / Math.max(50, 85 * U))),
    weights = Array.from({ length: count }, () =>
      Math.max(0.3, 1 + (rng() * 2 - 1) * 0.3),
    ),
    sum = weights.reduce((a, b) => a + b, 0);
  let x = colL;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (let k = 0; k < count; k++) {
    const w = (weights[k] * avail) / sum,
      ix = x + 4 * U,
      iw = w - 8 * U;
    let y = top + 5 * U;
    if (k) {
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
    }
    let first = true;
    while (y < bot - 12 * U) {
      if (first || rng() < 0.3) {
        const fs = (7.5 + rng() * 2.5) * U;
        ctx.font = `800 ${fs}px ${SERIF}`;
        ctx.fillStyle = "#151515";
        const head = HEADS[Math.floor(rng() * HEADS.length)];
        let row = "";
        for (const wd of head.split(" ")) {
          if (row && ctx.measureText(row + " " + wd).width > iw) {
            y += fs * 1.1;
            ctx.fillText(row, ix, y);
            row = wd;
          } else row += (row ? " " : "") + wd;
        }
        if (row) {
          y += fs * 1.1;
          ctx.fillText(row, ix, y);
        }
        y += 3 * U;
      }
      first = false;
      ctx.font = `${7 * U}px ${SERIF}`;
      ctx.fillStyle = "#2A2A2A";
      const n = 5 + Math.floor(rng() * 20);
      for (let j = 0; j < n && y < bot - 9 * U; j++) {
        y += 9 * U;
        justify(ctx, rng, ix, y, iw, j === n - 1);
      }
      y += 5 * U;
      if (rng() < 0.45) {
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(ix, y);
        ctx.lineTo(ix + iw, y);
        ctx.stroke();
        y += 4 * U;
      }
    }
    x += w;
  }
  // The source's subtle paper grain is baked once, avoiding continuous flicker.
  const grain = ctx.createImageData(Math.ceil(W), Math.ceil(H));
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = rng();
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v < 0.5 ? 0 : 255;
    grain.data[i + 3] = Math.abs(v - 0.5) * 10;
  }
  const tile = document.createElement("canvas");
  tile.width = grain.width;
  tile.height = grain.height;
  tile.getContext("2d")?.putImageData(grain, 0, 0);
  ctx.drawImage(tile, 0, 0, W, H);
}
