// WCAG 2.x contrast of the kit tokens. Library for the tests and the demo page; CLI: node tools/contrast.mjs [path/to/tokens.css]
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new TypeError(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

const linear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a, b, weight) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `#${x.map((v, i) => Math.round(v * weight + y[i] * (1 - weight)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function parseTokens(css) {
  const block = (re, name) => {
    const m = re.exec(css);
    if (!m) throw new Error(`tokens: ${name} block not found`);
    return Object.fromEntries([...m[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, k, v]) => [k, v.toUpperCase()]));
  };
  return { dark: block(/:root\s*\{([^}]*)\}/, ':root'), light: block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/, ':root[data-theme="light"]') };
}

export const PILL_INK = 0.75;
export const PILL_TINT = 0.18;
const STATUS = ['ok', 'warn', 'danger', 'info'];
const CHARTS = Array.from({ length: 8 }, (_, i) => `chart-${i + 1}`);
const FLOORS = [
  ...['bg', 'surface', 'surface-2'].map((bg) => ['text', bg, 7]),
  ...['bg', 'surface', 'surface-2'].map((bg) => ['muted', bg, 4.5]),
  ['accent-fg', 'accent', 4.5],
  ...[...STATUS, ...CHARTS].map((fg) => [fg, 'surface', 3]),
];

export function checkTokens(t) {
  const rows = FLOORS.map(([fg, bg, min]) => ({ pair: `--${fg} on --${bg}`, value: ratio(t[fg], t[bg]), min }));
  for (const kind of [...STATUS, 'muted', 'accent']) {
    rows.push({ pair: `pill --${kind}`, value: ratio(mix(t[kind], t.text, PILL_INK), mix(t[kind], t.surface, PILL_TINT)), min: 4.5 });
  }
  return rows.map((r) => ({ ...r, pass: r.value >= r.min, value: Math.round(r.value * 100) / 100 }));
}

if (typeof process !== 'undefined' && /contrast\.mjs$/.test(process.argv?.[1] ?? '')) {
  const { readFileSync } = await import('node:fs');
  const tokens = parseTokens(readFileSync(process.argv[2] ?? new URL('../dist/tokens.css', import.meta.url), 'utf8'));
  let failed = 0;
  for (const theme of ['dark', 'light']) {
    for (const r of checkTokens(tokens[theme])) {
      if (!r.pass) failed += 1;
      console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${r.pair.padEnd(24)} ${r.value.toFixed(2).padStart(5)}  (min ${r.min})`);
    }
  }
  console.log(failed ? `${failed} pair(s) below their floor` : 'every pair meets its floor');
  process.exit(failed ? 1 : 0);
}
