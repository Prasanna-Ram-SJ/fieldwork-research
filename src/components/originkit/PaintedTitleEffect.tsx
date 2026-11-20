"use client";
// Dynamic Weight — Originkit, adapted from the source supplied by the owner.
// Retains its per-letter linear proximity and exponential smoothing, applying
// weight to the actual painted mask instead of substituting variable-font type.
// Paperline's local dotted fade is retained; the former vector rig is removed.
import { useEffect, useRef } from "react";
import type { PaintedGlyph } from "./paperline-engine";

const VERT = `attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`;
const FRAG = `precision highp float;
uniform sampler2D uMap;
uniform vec2 uRes,uPtr;
uniform float uReach,uHover,uStroke;
uniform vec4 uGlyphs[9];
varying vec2 vUv;
void main(){
 vec2 original=texture2D(uMap,vUv).rg;
 float nearest=10000.,weight=0.;
 for(int i=0;i<9;i++){
  float distance=abs(vUv.x-uGlyphs[i].x)/max(.001,uGlyphs[i].z);
  if(distance<nearest){nearest=distance;weight=uGlyphs[i].w;}
 }
 float fill=original.r;
 if(weight>.001){
  vec2 r=vec2(uStroke*weight)/uRes;
  fill=max(fill,texture2D(uMap,vUv+vec2(r.x,0.)).r);
  fill=max(fill,texture2D(uMap,vUv-vec2(r.x,0.)).r);
  fill=max(fill,texture2D(uMap,vUv+vec2(0.,r.y)).r);
  fill=max(fill,texture2D(uMap,vUv-vec2(0.,r.y)).r);
  fill=max(fill,texture2D(uMap,vUv+r*.7071).r);
  fill=max(fill,texture2D(uMap,vUv-r*.7071).r);
  fill=max(fill,texture2D(uMap,vUv+vec2(r.x,-r.y)*.7071).r);
  fill=max(fill,texture2D(uMap,vUv+vec2(-r.x,r.y)*.7071).r);
 }
 float aspect=uRes.x/uRes.y;
 float distance=length((vUv-uPtr)/vec2(1.,aspect));
 float proximity=(1.-pow(smoothstep(0.,uReach,distance),3.))*uHover;
 float alpha=mix(fill,original.g,proximity);
 gl_FragColor=vec4(vec3(.02)*alpha,alpha);
}`;

export function PaintedTitleEffect({
  paint,
  glyphs,
  onReady,
}: {
  paint: HTMLCanvasElement;
  glyphs: PaintedGlyph[];
  onReady: (ready: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    hitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current,
      hit = hitRef.current;
    if (!canvas || !hit) return;
    const host = canvas.parentElement!,
      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
      });
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    const make = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      shaders.push(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vs = make(gl.VERTEX_SHADER, VERT),
      fs = make(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      shaders.forEach((s) => gl.deleteShader(s));
      return;
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const maxTexture = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      scale = Math.min(1, maxTexture / Math.max(paint.width, paint.height)),
      mask = scale === 1 ? paint : document.createElement("canvas");
    if (scale < 1) {
      mask.width = Math.round(paint.width * scale);
      mask.height = Math.round(paint.height * scale);
      mask.getContext("2d")?.drawImage(paint, 0, 0, mask.width, mask.height);
    }
    const w = mask.width,
      h = mask.height,
      ctx = mask.getContext("2d")!;
    const source = ctx.getImageData(0, 0, w, h),
      atlas = ctx.createImageData(w, h),
      data = source.data;
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4,
          a = data[i + 3];
        atlas.data[i] = a;
        atlas.data[i + 3] = 255;
        if (a > 24) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        const edge =
          a > 20 &&
          ([-2, 2].some(
            (dx) =>
              x + dx >= 0 &&
              x + dx < w &&
              data[(y * w + x + dx) * 4 + 3] < a * 0.65,
          ) ||
            [-2, 2].some(
              (dy) =>
                y + dy >= 0 &&
                y + dy < h &&
                data[((y + dy) * w + x) * 4 + 3] < a * 0.65,
            ));
        atlas.data[i + 1] =
          edge && ((x % 8) - 3.5) ** 2 + ((y % 8) - 3.5) ** 2 < 4 ? 255 : 0;
      }
    if (maxX >= minX) {
      const pad = Math.max(
          20,
          Math.min(60, ((maxY - minY + 1) / h) * paint.height * 0.28),
        ),
        left = Math.max(0, minX / w - pad / paint.width),
        top = Math.max(0, minY / h - pad / paint.height),
        right = Math.min(1, (maxX + 1) / w + pad / paint.width),
        bottom = Math.min(1, (maxY + 1) / h + pad / paint.height);
      Object.assign(hit.style, {
        left: left * 100 + "%",
        top: top * 100 + "%",
        width: (right - left) * 100 + "%",
        height: (bottom - top) * 100 + "%",
      });
    }
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = w;
    textureCanvas.height = h;
    textureCanvas.getContext("2d")!.putImageData(atlas, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      textureCanvas,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const U = Object.fromEntries(
      ["uMap", "uRes", "uPtr", "uReach", "uHover", "uStroke", "uGlyphs[0]"].map(
        (n) => [n, gl.getUniformLocation(program, n)],
      ),
    );
    const pointer = { x: 0.5, y: 0.5 },
      eased = { ...pointer },
      factors = new Float32Array(9),
      uniforms = new Float32Array(36),
      reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let over = false,
      hover = 0,
      last = 0,
      raf = 0,
      alive = true;
    const start = () => {
      if (alive && !document.hidden && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const move = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / box.width;
      pointer.y = 1 - (event.clientY - box.top) / box.height;
      over = true;
      start();
    };
    const leave = () => {
      over = false;
      start();
    };
    const touchEnd = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") leave();
    };
    function frame(now: number) {
      if (!alive) return;
      raf = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const W = host.clientWidth,
        H = host.clientHeight,
        dpr = Math.min(2, devicePixelRatio || 1);
      if (
        canvas!.width !== Math.round(W * dpr) ||
        canvas!.height !== Math.round(H * dpr)
      ) {
        canvas!.width = Math.round(W * dpr);
        canvas!.height = Math.round(H * dpr);
      }
      const damp = 1 - Math.exp(-12 * dt);
      eased.x += (pointer.x - eased.x) * damp;
      eased.y += (pointer.y - eased.y) * damp;
      hover +=
        ((over && !reduced.matches ? 1 : 0) - hover) *
        (1 - Math.exp(-dt / (over ? 0.08 : 0.2)));
      const reach = Math.max(180, Math.min(400, W * 0.32)),
        smooth = 1 - Math.exp(-dt / 0.3);
      for (let i = 0; i < 9; i++) {
        const glyph = glyphs[i],
          cx = (glyph.x / paint.width) * W,
          cy = (glyph.y / paint.height) * H,
          dist = Math.hypot(pointer.x * W - cx, (1 - pointer.y) * H - cy),
          target =
            over && !reduced.matches
              ? Math.max(0, Math.min(1, 1 - dist / reach))
              : 0;
        factors[i] += (target - factors[i]) * smooth;
        uniforms.set(
          [cx / W, 1 - cy / H, glyph.halfWidth / paint.width, factors[i]],
          i * 4,
        );
      }
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.useProgram(program);
      gl!.uniform1i(U.uMap, 0);
      gl!.uniform2f(U.uRes, W, H);
      gl!.uniform2f(U.uPtr, eased.x, eased.y);
      gl!.uniform1f(U.uReach, Math.min(190 / W, 0.3));
      gl!.uniform1f(U.uHover, hover);
      gl!.uniform1f(
        U.uStroke,
        Math.max(1.2, Math.min(5, glyphs[0].halfWidth * 0.12)),
      );
      gl!.uniform4fv(U["uGlyphs[0]"], uniforms);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      if (
        !document.hidden &&
        ((over && !reduced.matches) ||
          hover > 0.001 ||
          factors.some((f) => f > 0.001))
      )
        raf = requestAnimationFrame(frame);
    }
    const visibility = () => {
      if (document.hidden) {
        over = false;
        cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      onReady(false);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerenter", move);
    hit.addEventListener("pointerleave", leave);
    hit.addEventListener("pointerup", touchEnd);
    document.addEventListener("visibilitychange", visibility);
    canvas.addEventListener("webglcontextlost", lost);
    onReady(true);
    start();
    return () => {
      alive = false;
      onReady(false);
      cancelAnimationFrame(raf);
      hit.removeEventListener("pointermove", move);
      hit.removeEventListener("pointerenter", move);
      hit.removeEventListener("pointerleave", leave);
      hit.removeEventListener("pointerup", touchEnd);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
    };
  }, [paint, glyphs, onReady]);
  return (
    <>
      <canvas
        className="vector-paint painted-title-effect"
        ref={canvasRef}
        aria-hidden="true"
      />
      <div className="wordmark-hit-area" ref={hitRef} aria-hidden="true" />
    </>
  );
}
