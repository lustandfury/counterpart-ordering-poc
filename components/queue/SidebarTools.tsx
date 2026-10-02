import { AdjustmentsHorizontalIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

const TOOL_ROW = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-small text-muted hover:bg-bg hover:text-ink";

/** The secondary, technical tools at the foot of the orders sidebar. */
export function SidebarTools({ settingsOpen, settingsChanged, onSettings, onAbout }: { settingsOpen: boolean; settingsChanged: boolean; onSettings: () => void; onAbout: () => void }) {
  return (
    <div className="shrink-0 border-t border-line px-3 py-2">
      <button
        onClick={onSettings}
        aria-expanded={settingsOpen}
        aria-controls="settings"
        aria-label={settingsChanged ? "Settings (thresholds changed)" : "Settings"}
        className={TOOL_ROW}
      >
        <AdjustmentsHorizontalIcon aria-hidden className="h-4 w-4" />Settings
        {settingsChanged && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--warn-line)]" aria-hidden />}
      </button>
      <button onClick={onAbout} aria-label="About Counterpart" className={TOOL_ROW}>
        <QuestionMarkCircleIcon aria-hidden className="h-4 w-4" />About
      </button>
    </div>
  );
}
