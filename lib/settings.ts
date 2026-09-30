"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_T, UNIT_OK_MIN } from "./pipeline/route";

const KEY = "counterpart-thresholds";
const EVENT = "counterpart-thresholds-changed";
const defaults = JSON.stringify({ T: DEFAULT_T, unitMin: UNIT_OK_MIN });
const snapshot = () => { try { return localStorage.getItem(KEY) ?? defaults; } catch { return defaults; } };
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", notify); };
};

function parseSettings(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.T === "number" && parsed.T >= 0 && parsed.T <= 1 && typeof parsed.unitMin === "number" && parsed.unitMin >= 0 && parsed.unitMin <= 1) return { T: parsed.T as number, unitMin: parsed.unitMin as number };
  } catch { /* Use defaults for invalid saved settings. */ }
  return { T: DEFAULT_T, unitMin: UNIT_OK_MIN };
}

export function useThresholds() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => defaults);
  const settings = parseSettings(raw);
  const update = (next: typeof settings) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { return; }
    window.dispatchEvent(new Event(EVENT));
  };
  return { ...settings,
    setT: (T: number) => update({ ...parseSettings(snapshot()), T }),
    setUnitMin: (unitMin: number) => update({ ...parseSettings(snapshot()), unitMin }),
    reset: () => update({ T: DEFAULT_T, unitMin: UNIT_OK_MIN }),
    changed: settings.T !== DEFAULT_T || settings.unitMin !== UNIT_OK_MIN,
  };
}
