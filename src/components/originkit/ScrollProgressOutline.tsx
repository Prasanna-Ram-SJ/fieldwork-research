"use client";
// Scroll Progress Outline — Originkit. Its connected path, nodes and turning
// arrow now follow the explicit answer scroller and real heading offsets.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
export type OutlineSection = { id: string; title: string; level: number };
type Pt = { x: number; y: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function ScrollProgressOutline({
  scroller,
  sections,
  onNavigate,
}: {
  scroller: React.RefObject<HTMLDivElement | null>;
  sections: OutlineSection[];
  onNavigate?: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    arrow = useRef<SVGPolygonElement>(null),
    solid = useRef<SVGPathElement>(null),
    live = useRef({ position: 0, angle: 0 }),
    [active, setActive] = useState(0),
    [dimensions, setDimensions] = useState({ height: 500, width: 190 });
  const gap = 56,
    contentHeight = Math.max(dimensions.height - 38, 64 + Math.max(0, sections.length - 1) * gap),
    nodes = sections.map((s, i) => ({ x: 17 + clamp(s.level, 0, 3) * 16, y: 30 + i * gap }));
  const pts: Pt[] = [];
  nodes.forEach((n, i) => {
    if (!i) {
      pts.push({ x: n.x, y: n.y - 24 }, n);
    } else {
      const a = nodes[i - 1];
      if (a.x !== n.x)
        pts.push({ x: a.x, y: a.y + 14 }, { x: n.x, y: n.y - 14 });
      pts.push(n);
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  const nodeLen = nodes.map((n) => cum[pts.indexOf(n)]),
    total = cum.at(-1) || 0,
    d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const geometry = useRef({ pts, cum, nodeLen, total });
  geometry.current = { pts, cum, nodeLen, total };
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setDimensions({ height: el.clientHeight, width: Math.max(1, viewport.current?.clientWidth || el.clientWidth) });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !sections.length) return;
    let frame = 0;
    const measure = () => {
      const box = sc.getBoundingClientRect(),
        y = sc.scrollTop + 36;
      const offsets = sections.map((s) => {
        const el = document.getElementById(s.id);
        return el ? el.getBoundingClientRect().top - box.top + sc.scrollTop : 0;
      });
      let i = 0;
      while (i < offsets.length - 1 && y >= offsets[i + 1]) i++;
      const next = offsets[i + 1];
      let fraction = next
        ? clamp((y - offsets[i]) / (next - offsets[i] || 1), 0, 1)
        : 0;
      if (
        sc.scrollHeight - sc.clientHeight > 2 &&
        sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 2
      ) {
        i = offsets.length - 1;
        fraction = 0;
      }
      live.current.position = i + fraction;
      setActive(i);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    sc.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(sc);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    measure();
    return () => {
      sc.removeEventListener("scroll", schedule);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scroller, sections]);
  useEffect(() => {
    const el = viewport.current, node = nodes[active];
    if (!el || !node) return;
    // Follow reading without moving the document or resetting a manually browsed outline.
    if (node.y < el.scrollTop + 24) el.scrollTo({ top: Math.max(0, node.y - 24) });
    else if (node.y > el.scrollTop + el.clientHeight - 28)
      el.scrollTo({ top: node.y - el.clientHeight + 28 });
  }, [active, dimensions.height]);
  useEffect(() => {
    let raf = 0,
      last = 0,
      h = 0,
      previous = 0,
      movingUp = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const point = (s: number) => {
      const g = geometry.current;
      for (let i = 1; i < g.pts.length; i++)
        if (s <= g.cum[i] || i === g.pts.length - 1) {
          const f = clamp(
              (s - g.cum[i - 1]) / (g.cum[i] - g.cum[i - 1] || 1),
              0,
              1,
            ),
            a = g.pts[i - 1],
            b = g.pts[i];
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        }
      return g.pts[0] || { x: 17, y: 65 };
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const g = geometry.current,
        target = clamp(
          live.current.position,
          0,
          Math.max(0, g.nodeLen.length - 1),
        );
      h = reduced.matches
        ? target
        : h + (target - h) * (1 - Math.exp(-dt / 0.22));
      h = clamp(h, 0, Math.max(0, g.nodeLen.length - 1));
      const i = Math.floor(h),
        f = h - i,
        s =
          (g.nodeLen[i] || 0) +
          f * ((g.nodeLen[i + 1] ?? g.nodeLen[i] ?? 0) - (g.nodeLen[i] || 0)),
        p = point(s),
        a = point(Math.max(0, s - 5)),
        b = point(Math.min(g.total, s + 5));
      if (Math.abs(h - previous) > 0.0001) movingUp = h < previous;
      const angle = Math.atan2(-(b.x - a.x), b.y - a.y) + (movingUp ? Math.PI : 0);
      previous = h;
      let delta = angle - live.current.angle;
      delta =
        ((((delta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
        Math.PI;
      live.current.angle +=
        delta * (reduced.matches ? 1 : 1 - Math.exp(-dt / 0.07));
      arrow.current?.setAttribute(
        "transform",
        `translate(${p.x} ${p.y}) rotate(${(live.current.angle * 180) / Math.PI})`,
      );
      solid.current?.setAttribute("stroke-dasharray", `${s} ${g.total + 100}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  function jump(id: string) {
    const sc = scroller.current,
      el = document.getElementById(id);
    if (!sc || !el) return;
    const top =
      el.getBoundingClientRect().top -
      sc.getBoundingClientRect().top +
      sc.scrollTop -
      26;
    sc.scrollTo({
      top,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    onNavigate?.();
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }
  return (
    <nav ref={root} className="progress-outline" aria-label="Answer outline">
      <div className="outline-heading">On this page</div>
      {!sections.length ? (
        <p className="rail-empty">The outline appears with your answer.</p>
      ) : (
        <div className="outline-scroll" ref={viewport} tabIndex={0} aria-label="All answer sections">
        <div className="outline-track" style={{ height: contentHeight }}>
          <svg width="100%" height={contentHeight} viewBox={`0 0 ${dimensions.width} ${contentHeight}`} preserveAspectRatio="none" aria-hidden="true">
            <path
              d={d}
              fill="none"
              stroke="#b6b2a7"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <path
              ref={solid}
              d={d}
              fill="none"
              stroke="#282720"
              strokeWidth="1.25"
            />
            {nodes.map((n, i) => (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r="3"
                stroke="#49473f"
                fill={i <= active ? "#49473f" : "#F4F2EC"}
              />
            ))}
            <polygon ref={arrow} points="0,9 7,-7 0,-3 -7,-7" fill="#111111" stroke="#F4F2EC" strokeWidth="1.5" strokeLinejoin="round" paintOrder="stroke" transform={`translate(${nodes[0]?.x || 17} ${nodes[0]?.y || 30})`} />
          </svg>
          <ol>
            {sections.map((s, i) => (
              <li key={s.id} style={{ top: nodes[i].y, left: nodes[i].x + 18 }}>
                <button
                  aria-current={active === i ? "location" : undefined}
                  title={s.title}
                  onClick={() => jump(s.id)}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
        </div>
      )}
    </nav>
  );
}
