import React from "react";

// Shared context for the demo wallet address.
// SettleDashboard wraps the app in DemoCtx.Provider.
// Any component that calls useViewAddress() will read from it.
export const DemoCtx = React.createContext<`0x${string}` | undefined>(
  undefined,
);
