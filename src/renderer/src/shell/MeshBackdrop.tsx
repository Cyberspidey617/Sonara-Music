import { useEffect, useRef } from 'react';
import { GRID, meshPalette, NEUTRAL, type Rgb } from '@/lib/palette';

/*
 * The artwork's colours as a slowly drifting mesh of soft blobs, the backdrop
 * BitChord's now-playing screen is known for. Each of the GRID² colours is a
 * Gaussian blob; they're blended in linear light (clean mid-tones, not mud)
 * and dithered per frame so dark gradients don't band.
 */
const N = GRID * GRID;
const VERTEX = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec3 uCol[${N}];
uniform vec3 uBlob[${N}];
uniform float uFrame;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031 + uFrame * 0.0137); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float side = max(uRes.x, uRes.y);
  vec3 sum = vec3(0.0); float weight = 0.0001;
  for (int i = 0; i < ${N}; i++) {
    float d = distance(px, uBlob[i].xy * uRes) / (uBlob[i].z * side);
    float w = exp(-4.0 * d * d);
    sum += pow(uCol[i], vec3(2.2)) * w; weight += w;
  }
  vec3 color = pow(sum / weight, vec3(1.0 / 2.2)) * 0.92;
  color += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}`;

const BLOBS = Array.from({ length: N }, (_, i) => {
  const row = Math.floor(i / GRID);
  const col = i % GRID;
  const spread = (n: number) => -0.1 + ((n + 0.5) / GRID) * 1.2;
  const seed = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
  return {
    // Turned a quarter, so the colours don't line up with the artwork shown over them.
    x: spread(GRID - 1 - row),
    y: spread(col),
    phase: [seed(1), seed(2), seed(3)].map((v) => v * Math.PI * 2),
    speed: [0.07 + seed(4) * 0.06, 0.06 + seed(5) * 0.06, 0.05 + seed(6) * 0.04],
  };
});

function blobsAt(t: number): Float32Array {
  const out = new Float32Array(N * 3);
  BLOBS.forEach(({ x, y, phase, speed }, i) => {
    out[i * 3] = x + 0.16 * Math.sin(t * speed[0]! + phase[0]!);
    out[i * 3 + 1] = y + 0.2 * Math.cos(t * speed[1]! + phase[1]!);
    out[i * 3 + 2] = 0.62 * (0.85 + 0.2 * Math.sin(t * speed[2]! + phase[2]!));
  });
  return out;
}

const FALLBACK: Rgb[] = Array.from({ length: N }, () => NEUTRAL);

export function MeshBackdrop({ artworkUrl, playing, speed = 1 }: { artworkUrl?: string; playing: boolean; speed?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef<Rgb[]>(FALLBACK);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!artworkUrl) {
      target.current = FALLBACK;
      return;
    }
    let alive = true;
    meshPalette(artworkUrl).then(
      (cells) => alive && (target.current = cells),
      () => alive && (target.current = FALLBACK),
    );
    return () => {
      alive = false;
    };
  }, [artworkUrl]);

  useEffect(() => {
    const el = canvas.current!;
    const gl = el.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uCol = gl.getUniformLocation(program, 'uCol');
    const uBlob = gl.getUniformLocation(program, 'uBlob');
    const uFrame = gl.getUniformLocation(program, 'uFrame');

    let shown = FALLBACK.map((c) => [...c] as Rgb);
    let frame = 0;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let prev = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 1000 / 30) return;
      last = now;
      // Drift at full speed while playing, a tenth of it while paused.
      clock += ((now - prev) / 1000) * speedRef.current * (playingRef.current ? 1 : 0.1);
      prev = now;
      const scale = Math.min(window.devicePixelRatio || 1, 1);
      const w = Math.round(el.clientWidth * scale);
      const h = Math.round(el.clientHeight * scale);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        gl.viewport(0, 0, w, h);
      }
      // Ease toward the new artwork's colours.
      shown = shown.map((c, i) => c.map((v, j) => v + (target.current[i]![j]! - v) * 0.06) as Rgb);
      gl.uniform2f(uRes, w, h);
      gl.uniform3fv(uCol, new Float32Array(shown.flatMap((c) => c.map((v) => v / 255))));
      gl.uniform3fv(uBlob, blobsAt(clock + 40));
      gl.uniform1f(uFrame, (frame = (frame + 1) % 1000));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#202024]">
      <canvas ref={canvas} className="size-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.35))]" />
    </div>
  );
}

/** The artwork itself, hugely blurred, drifting slowly: the other backdrop style. */
export function ArtworkBackdrop({ artworkUrl, speed = 1 }: { artworkUrl?: string; speed?: number }) {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#141416]">
      {artworkUrl && (
        <img
          key={artworkUrl}
          src={artworkUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute top-1/2 left-1/2 size-[140vmax] max-w-none -translate-x-1/2 -translate-y-1/2 animate-fade-in object-cover blur-[90px] brightness-[0.55] saturate-[1.5]"
          style={speed > 0 ? { animation: `backdrop-drift ${Math.round(60 / speed)}s linear infinite` } : undefined}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.45))]" />
    </div>
  );
}

/** One calm colour from the artwork. */
export function SolidBackdrop({ color }: { color: string | null }) {
  return <div className="absolute inset-0 -z-10 transition-colors duration-700" style={{ background: color ? `linear-gradient(160deg, ${color}, #0b0b0d 120%)` : '#202024' }} />;
}
