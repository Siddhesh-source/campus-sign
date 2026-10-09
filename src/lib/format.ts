const TZ = "Asia/Kolkata";

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(d));
}

export function fmtStamp(d: Date | string) {
  const x = new Date(d);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(x);
  return `${parts.replace(",", "")} IST`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function classLine(c: { yearOfStudy: string; division: string; academicYear: string }) {
  return `${c.yearOfStudy} · Div ${c.division} · ${c.academicYear.replace("-", "–")}`;
}

/** Compact an IP for display: drop IPv4-mapped prefixes, collapse zero runs ("0000:…:0001" → "::1"). */
export function shortIp(ip: string | null | undefined) {
  if (!ip) return "—";
  const v4 = ip.match(/ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  if (ip.includes("::")) return ip.toLowerCase(); // already compressed
  const groups = ip
    .split(":")
    .map((g) => g.replace(/^0+(?=.)/, "").toLowerCase());
  // Collapse the longest run of zero groups to "::".
  let best = { start: -1, len: 0 };
  for (let i = 0; i < groups.length; ) {
    if (groups[i] !== "0") { i++; continue; }
    let j = i;
    while (j < groups.length && groups[j] === "0") j++;
    if (j - i > best.len) best = { start: i, len: j - i };
    i = j;
  }
  if (best.len < 2) return groups.join(":");
  return `${groups.slice(0, best.start).join(":")}::${groups.slice(best.start + best.len).join(":")}`;
}
