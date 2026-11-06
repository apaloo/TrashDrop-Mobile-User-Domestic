// Spots a mistyped email domain ("gmial.com") and suggests the likely one,
// so a failed sign-in can say "Did you mean ...@gmail.com?"
const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'aol.com'];

// Edit distance, counting a swap of two neighbouring letters as one edit
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
};

/** Returns the corrected email, or null when the domain looks right. */
export const suggestEmailFix = (email) => {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;
  let best = null;
  COMMON_DOMAINS.forEach((candidate) => {
    const dist = distance(domain, candidate);
    if (dist <= 2 && (!best || dist < best.dist)) best = { candidate, dist };
  });
  return best ? `${local}@${best.candidate}` : null;
};

export default suggestEmailFix;
