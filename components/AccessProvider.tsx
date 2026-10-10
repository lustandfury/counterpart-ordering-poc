"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const AccessContext = createContext<{
  unlocked: boolean;
  unlock: () => void;
} | null>(null);

// The root layout keeps this state across route changes. A full page reload
// creates a new provider and shows the welcome screen again.
export function AccessProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <AccessContext.Provider value={{ unlocked, unlock: () => setUnlocked(true) }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const access = useContext(AccessContext);
  if (!access) throw new Error("useAccess must be used within AccessProvider");
  return access;
}
