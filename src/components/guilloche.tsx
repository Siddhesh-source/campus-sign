/**
 * Security-print guilloché, generated from real parametric curves.
 * DESIGN.md: only on surfaces that prove something (code certificate,
 * class preview, sign-in panel, confirmation seal). Never as wallpaper.
 */

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Hypotrochoid rosette rings, rotated copies. */
function rosettePaths(size: number, R: number, r: number, d: number, loops: number, count: number) {
  const c = size / 2;
  const paths: string[] = [];
  for (let k = 0; k < count; k++) {
    const rot = ((k / count) * Math.PI * 2) / (R / gcd(R, r));
    const dd = d * (1 - k * 0.06);
    let s = "";
    const steps = 900;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * loops;
      const x = (R - r) * Math.cos(t) + dd * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - dd * Math.sin(((R - r) / r) * t);
      const xr = x * Math.cos(rot) - y * Math.sin(rot);
      const yr = x * Math.sin(rot) + y * Math.cos(rot);
      s += `${i ? "L" : "M"}${(c + xr).toFixed(1)} ${(c + yr).toFixed(1)}`;
    }
    paths.push(s);
  }
  return paths;
}

/** Interlaced sine bands. */
function bandPaths() {
  const W = 600;
  const H = 300;
  const paths: string[] = [];
  for (let k = 0; k < 22; k++) {
    const ph = k * 0.28;
    const amp = 18 + 8 * Math.sin(k * 0.7);
    const yo = H * 0.5 + (k - 11) * 9;
    let s = "";
    for (let x = 0; x <= W; x += 4) {
      const y = yo + amp * Math.sin(x / 38 + ph) * Math.cos(x / 170 - ph * 0.5);
      s += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    paths.push(s);
  }
  return paths;
}

const BAND = bandPaths();
const ROSETTE = rosettePaths(260, 95, 17, 52, 17, 4);
const ROSETTE_LG = rosettePaths(600, 230, 37, 120, 37, 5);
const SEAL = rosettePaths(200, 60, 13, 34, 13, 3);

export function GuillocheBand({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 300" preserveAspectRatio="none" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={0.6}>
      {BAND.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function GuillocheRosette({ className = "", large = false }: { className?: string; large?: boolean }) {
  const paths = large ? ROSETTE_LG : ROSETTE;
  const size = large ? 600 : 260;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={0.55}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** The confirmation seal. Stamps in once (see .seal-stamp in globals.css). */
export function Seal({ className = "h-32 w-32", label }: { className?: string; label: string }) {
  return (
    <svg viewBox="0 0 200 200" className={`seal-stamp text-green ${className}`} role="img" aria-label={label} fill="none" stroke="currentColor">
      {SEAL.map((d, i) => (
        <path key={i} d={d} strokeWidth={0.7} />
      ))}
      <circle cx="100" cy="100" r="94" strokeWidth={2.5} />
      <circle cx="100" cy="100" r="86" strokeWidth={1} strokeDasharray="2 3" />
      <circle cx="100" cy="100" r="30" fill="var(--paper)" stroke="none" />
      <path d="M84 101l11 11 22-25" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
