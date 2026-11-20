"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bakePaper, buildPaint, type PaintedGlyph } from "./paperline-engine";
import { PaintedTitleEffect } from "./PaintedTitleEffect";

// Document memory survives client navigation, but resets on a real reload/new tab.
// Keep the first mount's decision in a ref so Strict Mode's effect replay cannot
// consume the entrance before the visitor sees it.
let homeEntranceStarted = false;

export function PaperlineArchive() {
  const root = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLCanvasElement>(null),
    letter = useRef<HTMLCanvasElement>(null),
    entrance = useRef<{ animate: boolean; startedAt: number } | null>(null);
  const [paint, setPaint] = useState<{
      canvas: HTMLCanvasElement;
      glyphs: PaintedGlyph[];
    } | null>(null),
    [vectorReady, setVectorReady] = useState(false);
  const ready = useCallback((value: boolean) => setVectorReady(value), []);
  useEffect(() => {
    const host = root.current,
      pc = paper.current,
      lc = letter.current;
    if (!host || !pc || !lc) return;
    if (!entrance.current) {
      entrance.current = { animate: !homeEntranceStarted, startedAt: performance.now() };
      homeEntranceStarted = true;
    }
    let raf = 0,
      complete = !entrance.current.animate,
      disposed = false;
    const enteredAt = entrance.current.startedAt;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const render = () => {
      cancelAnimationFrame(raf);
      setPaint(null);
      setVectorReady(false);
      const W = host.clientWidth,
        H = host.clientHeight;
      if (!W || !H) return;
      bakePaper(pc, W, H, Math.min(2, devicePixelRatio || 1));
      lc.width = W;
      lc.height = H;
      const ctx = lc.getContext("2d");
      if (!ctx) return;
      const layout = buildPaint(W, H),
        start = enteredAt;
      const frame = (now: number) => {
        if (disposed) return;
        const t = complete || reduced.matches ? layout.end + 1 : now - start;
        layout.draw(ctx, t);
        if (t < layout.end + 1) {
          raf = requestAnimationFrame(frame);
        } else {
          complete = true;
          const texture = document.createElement("canvas");
          texture.width = W;
          texture.height = H;
          texture.getContext("2d")!.drawImage(lc, 0, 0);
          setPaint({ canvas: texture, glyphs: layout.glyphs });
        }
      };
      frame(performance.now());
    };
    const ro = new ResizeObserver(render);
    ro.observe(host);
    render();
    document.fonts.load('48px "Pirata One"').then(() => {
      if (!disposed)
        bakePaper(
          pc,
          host.clientWidth,
          host.clientHeight,
          Math.min(2, devicePixelRatio || 1),
        );
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return (
    <main ref={root} id="main-content" className="paperline-home">
      <h1 className="sr-only">Fieldwork</h1>
      <canvas ref={paper} className="paperline-paper" aria-hidden="true" />
      <canvas
        ref={letter}
        className="paperline-letters"
        style={{ opacity: vectorReady ? 0 : 1 }}
        aria-hidden="true"
      />
      {paint && (
        <PaintedTitleEffect
          paint={paint.canvas}
          glyphs={paint.glyphs}
          onReady={ready}
        />
      )}
      <noscript>
        <p className="home-fallback">Fieldwork</p>
      </noscript>
    </main>
  );
}
