"use client";
import {useLayoutEffect, useRef} from 'react';

/** Keep the single-screen guide readable between breakpoints and at browser
 * zoom levels. Reuse its existing full/compact/pocket copy; never clip a story. */
export function WorkflowPaper({children}: {children: React.ReactNode}) {
  const paper = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = paper.current;
    if (!root) return;
    let frame = 0, alive = true;
    const visible = (el: Element) => el.getClientRects().length > 0;
    const fits = () => {
      const bounds = root.getBoundingClientRect();
      const stories = root.querySelector('.guide-stories')!.getBoundingClientRect();
      for (const article of root.querySelectorAll('.guide-stories article')) {
        const box = article.getBoundingClientRect();
        if (box.bottom > stories.bottom + 1 || box.right > stories.right + 1) return false;
        for (const child of Array.from(article.children).filter(visible)) {
          const rect = child.getBoundingClientRect();
          if (rect.bottom > box.bottom + 1 || rect.right > box.right + 1) return false;
        }
      }
      const sections = Array.from(root.children).filter(visible);
      for (let i=0; i<sections.length; i++) {
        const box = sections[i].getBoundingClientRect();
        if (box.bottom > bounds.bottom + 1 || box.right > bounds.right + 1) return false;
        if (i && sections[i-1].getBoundingClientRect().bottom > box.top + 1) return false;
      }
      return true;
    };
    const fit = () => {
      if (!alive) return;
      for (const density of ['default','balanced','compact','pocket','minimal']) {
        root.dataset.fit = density;
        if (fits()) break;
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame=requestAnimationFrame(fit); };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    window.addEventListener('resize',schedule);
    document.fonts?.addEventListener('loadingdone',schedule);
    void document.fonts?.ready.then(schedule);
    fit();
    return () => { alive=false; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize',schedule); document.fonts?.removeEventListener('loadingdone',schedule); };
  }, []);
  return <div ref={paper} className="workflow-paper">{children}</div>;
}
