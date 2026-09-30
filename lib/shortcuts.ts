// Single-key review shortcuts (j/k/1-4/x/Enter) can be switched off (WCAG 2.1.4).
const KEY = "counterpart-shortcuts";

export function shortcutsEnabled(): boolean {
  try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setShortcutsEnabled(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked: the toggle just won't persist */ }
}
