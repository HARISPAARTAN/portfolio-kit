# Changelog

Versions are git tags; a consuming repository pins one in `web/kit/VERSION`.

## v0.1.0 (2026-10-29)

First release.

- `dist/tokens.css`: colour tokens for dark (default) and light (`data-theme="light"`) with an eight-colour chart palette per theme, fonts, radii, shadow, spacing scale, content width and gutter.
- `dist/base.css`: reset, type scale, focus ring, reduced-motion rule and the `pf-` components: page, header, brand, banner, card, KPI tile, grid, row, stack, table with sorting and pager, pills, buttons, theme toggle, tabs, chips, select and input, phone and tablet frames, flow player, footer and empty state.
- `dist/theme-boot.js`: sets `data-theme` before the first paint and shares `localStorage['hh-theme']` with the portfolio site; `window.pfTheme` and the `pf:theme` event.
- `dist/kit.js`: `createStore`, `createFilterBus`, `fmt`, `toCsv`, `sortRows`, `mountBanner`, `mountThemeToggle`, `renderKpi`, `pill`, `renderTable`, `download`, `fitFrame`, `initTabs`, `FlowPlayer` and the re-exported `createFlowState`.
- `dist/flow-state.js`: the flow state machine (`createFlowState`, `STATUSES`).
- `dist/echarts-theme.js`: categorical palette, sequential and diverging ramps, status colours and the `pf-dark` and `pf-light` ECharts themes.
- `dist/fonts/`: Inter, Space Grotesk and JetBrains Mono as variable woff2 files with the complete SIL Open Font License 1.1.
- `dist/MANIFEST.json` and `tools/sync_kit.py`: sizes and SHA-256 of the vendored files and the reference script that copies and checks them.
- The component gallery `demo/index.html` on GitHub Pages; unit tests, size, offline and manifest checks, a vendoring round trip and the Python tests in CI.
- Behaviours to rely on: the filter bus stores frozen shallow copies of arrays and plain objects, so changing the array you passed in changes nothing; `createStore().save` returns `false` and keeps nothing for a value that cannot be serialised, and `save(undefined)` clears; `mountThemeToggle` names its button "Theme: Dark" or "Theme: Light" and has no `aria-pressed`; `FlowPlayer` playback and `next()` walk the steps in array order and ignore `edges`, so a branching flow uses `controls: false` and `show`, `skip` and `fail`; the contrast test holds KPI delta and link colours at 4.5:1.
