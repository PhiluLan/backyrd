import { createContext, useContext } from "react";

export const StartupContentContext = createContext<{
  reportGateReady?: () => void;
  reportHomeReady?: () => void;
}>({});

export function useStartupContent() {
  return useContext(StartupContentContext);
}
