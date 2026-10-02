import { useState } from "react";
import { DEFAULT_T, UNIT_OK_MIN as DEFAULT_UNIT } from "@/lib/pipeline/route";
import { setShortcutsEnabled, shortcutsEnabled } from "@/lib/shortcuts";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";
import type { Mode } from "@/lib/view";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Button, TextButton } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SheetFooter, SheetHeader } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";

export type Thresholds = { mode: Mode; T: number; unitMin: number; setT: (v: number) => void; setUnitMin: (v: number) => void };

/** Whether either threshold differs from its default (the Settings row shows a dot when it does). */
export const thresholdsChanged = (T: number, unitMin: number) => T !== DEFAULT_T || unitMin !== DEFAULT_UNIT;

export function SettingsDialog(p: Thresholds & { open: boolean; changed: boolean; onClose: () => void }) {
  return (
    <ActionSheet open={p.open} onClose={p.onClose} labelledBy="settings-title" layer="settings">
      <SheetHeader id="settings-title" title="Settings" closeLabel="Close settings" onClose={p.onClose} />
      <SettingsSection {...p} />
      <SheetFooter>
        <Button onClick={p.onClose}>Done</Button>
      </SheetFooter>
    </ActionSheet>
  );
}

/** Review thresholds and preferences, rendered inside the settings dialog. */
function SettingsSection(p: Thresholds & { changed: boolean }) {
  return (
    <div id="settings" className="mt-5 divide-y divide-line border-y border-line">
      <section aria-labelledby="settings-thresholds" className="py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="settings-thresholds" className="text-heading font-semibold">Review thresholds</h3>
          <TextButton
            onClick={() => {
              p.setT(DEFAULT_T);
              p.setUnitMin(DEFAULT_UNIT);
            }}
            disabled={!p.changed}
          >
            Reset to defaults
          </TextButton>
        </div>
        <p className="mt-1 text-small text-muted">
          {p.mode === "claude" ? "Claude only has no thresholds: it approves its own “high” ratings." : "Higher = the rep checks more lines. Lines re-route instantly; no new API calls."}
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Slider id="t" label="Product confidence" value={p.T} min={0.5} max={0.99} onChange={p.setT} disabled={p.mode === "claude"} />
          <Slider id="u" label="Quantity clarity" value={p.unitMin} min={0.3} max={0.9} onChange={p.setUnitMin} disabled={p.mode === "claude"} />
        </div>
      </section>
      <section aria-labelledby="settings-preferences" className="py-5">
        <h3 id="settings-preferences" className="text-heading font-semibold">Preferences</h3>
        <div className="mt-3 flex flex-col gap-4">
          <ThemeChoice />
          <ShortcutsToggle />
        </div>
      </section>
    </div>
  );
}

function Slider(p: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="w-full">
      <label htmlFor={p.id} className="mb-1.5 flex justify-between text-small font-medium text-muted">
        <span>{p.label}</span>
        <span className="text-ink">{p.value.toFixed(2)}</span>
      </label>
      <input id={p.id} type="range" min={p.min} max={p.max} step={0.01} value={p.value} aria-valuetext={`${Math.round(p.value * 100)}%`} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))} className="h-7 w-full accent-[var(--ink)] disabled:opacity-40" />
    </div>
  );
}

function ShortcutsToggle() {
  // Rendered only when Settings is open, so reading storage here is client-side only.
  const [on, setOn] = useState(() => shortcutsEnabled());
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id="shortcuts-label" className="text-small font-medium">Keyboard shortcuts</p>
        <p className="mt-0.5 text-small text-muted">Single-key shortcuts in the review. Turn off if they get in the way of speech input or assistive technology.</p>
      </div>
      <Switch on={on} onChange={(next) => { setOn(next); setShortcutsEnabled(next); }} labelledBy="shortcuts-label" />
    </div>
  );
}

const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

/** Light / Dark / System. Rendered only when Settings is open, so reading storage here is client-side only. */
function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  return (
    <div className="flex items-center justify-between gap-4">
      <p id="theme-label" className="text-small font-medium">Theme</p>
      <SegmentedControl
        labelledBy="theme-label"
        options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
        value={theme}
        onChange={(t) => {
          setTheme(t);
          applyTheme(t);
        }}
      />
    </div>
  );
}
