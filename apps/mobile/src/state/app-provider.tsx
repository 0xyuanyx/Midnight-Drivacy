import AsyncStorage from "@react-native-async-storage/async-storage";
import { linkedDemoEnabled } from "@/api/linked-demo";
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type PropsWithChildren } from "react";

import {
  appReducer,
  initialAppState,
  type AppAction,
  type AppState,
} from "./app-state";

const APP_STATE_STORAGE_KEY = "@drivacy/demo-state/v1";

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isHydrated: boolean;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const storedState = await AsyncStorage.getItem(APP_STATE_STORAGE_KEY);
        if (storedState && isMounted) {
          dispatch({ type: "HYDRATE", persistedState: JSON.parse(storedState), mode: linkedDemoEnabled ? "linked" : "local" });
        }
      } catch {
        // An unreadable demo cache falls back to the initial deterministic scenario.
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrated) {
      void AsyncStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
    }
  }, [isHydrated, state]);

  const value = useMemo(
    () => ({ state, dispatch, isHydrated }),
    [isHydrated, state],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used inside AppProvider");
  }

  return value;
}
