/**
 * TrashDrop brand tokens for inline styles, the same as the website and admin
 * dashboard (apaloo/TrashDrop_Management_webApp_admins, docs/DESIGN_SYSTEM.md).
 * The CSS custom properties in src/theme/tokens.css hold the same values; keep
 * the two in step.
 *
 * Colours stay plain hex strings because the pages append alpha to them
 * (`${TD.lime}40`), which a var() can't take.
 *
 *   lime     brand green, from the logo. Fills and highlights with ink text,
 *            text and buttons on dark surfaces. Never text on light surfaces.
 *   forest   action colour on light surfaces (white text on it: 6.3:1)
 *   orange   the one secondary accent. Fills with ink text, text on dark.
 *            On light surfaces use orangeText.
 *   ink      text on light surfaces; the dark hero, header and footer
 */
export const TD = {
  lime:       '#b6ee69',
  forest:     '#1b6e35',
  forestDk:   '#0f4020',
  ink:        '#0a0f0a',
  ink2:       '#111a13',
  sage:       '#525c52', // secondary text on light surfaces (7.0:1 on white)
  sageOnDark: '#a9b2a9', // secondary text on dark surfaces (8.9:1 on ink)
  cream:      '#f6f8f4',
  orange:     '#f98b38',
  orangeText: '#b4530e', // orange as text on light surfaces (5.0:1 on white)
};

/** One typeface, DM Sans, in four weights (400, 500, 600, 700) */
export const FONT = "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// The roles keep their names so sections read the same; they share the face
// and differ in weight only
export const FF = {
  display: { fontFamily: FONT, fontWeight: 700, lineHeight: 1.12 },
  body:    { fontFamily: FONT },
  label:   { fontFamily: FONT },
  data:    { fontFamily: FONT, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
};

/**
 * The type scale as inline styles (docs/DESIGN_SYSTEM.md). Hierarchy comes
 * from size: the hero is the one bold line; section headings are a step
 * lighter so it stands apart.
 */
export const TYPE = {
  h1:      { fontFamily: FONT, fontWeight: 700, fontSize: 'var(--td-h1)', lineHeight: 1.08, letterSpacing: '-0.02em' },
  h2:      { fontFamily: FONT, fontWeight: 600, fontSize: 'var(--td-h2)', lineHeight: 1.12, letterSpacing: '-0.015em' },
  h3:      { fontFamily: FONT, fontWeight: 600, fontSize: 'var(--td-h3)', lineHeight: 1.25, letterSpacing: '-0.01em' },
  card:    { fontFamily: FONT, fontWeight: 600, fontSize: 20, lineHeight: 1.3 },
  lead:    { fontFamily: FONT, fontWeight: 400, fontSize: 18, lineHeight: 1.6 },
  body:    { fontFamily: FONT, fontWeight: 400, fontSize: 16, lineHeight: 1.6 },
  small:   { fontFamily: FONT, fontWeight: 400, fontSize: 14, lineHeight: 1.5 },
  eyebrow: { fontFamily: FONT, fontWeight: 600, fontSize: 13, lineHeight: 1.4, letterSpacing: '0.08em', textTransform: 'uppercase' },
  stat:    { fontFamily: FONT, fontWeight: 700, fontSize: 30, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
};

/**
 * One button: a 48px pill. `primary` on light surfaces, `primaryOnDark` on
 * dark ones, `tonal` for the second action beside a primary.
 */
const BTN_BASE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '0 24px', borderRadius: 999, border: 'none', fontFamily: FONT, fontSize: 16, fontWeight: 600, lineHeight: 1, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' };
export const BTN = {
  primary:       { ...BTN_BASE, background: TD.forest, color: '#ffffff' },
  primaryOnDark: { ...BTN_BASE, background: TD.lime, color: TD.ink },
  tonal:         { ...BTN_BASE, background: '#e6f2e9', color: TD.forest },
  ghostOnDark:   { ...BTN_BASE, background: 'transparent', color: '#ffffff', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.4)' },
  // Header-sized: the same pill, a little shorter
  small:         { minHeight: 40, padding: '0 18px', fontSize: 15 },
};
