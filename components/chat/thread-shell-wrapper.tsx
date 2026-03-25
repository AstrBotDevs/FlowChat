"use client";

import type { ReactNode } from "react";

// ThreadShellWrapper is now a passthrough — the drill logic is self-contained
// in InlineDrillCard and useThreadAPI, no global provider needed.
export function ThreadShellWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
