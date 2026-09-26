import AsyncStorage from "@react-native-async-storage/async-storage";
import { linkedDemoEnabled } from "@/api/linked-demo";
import { createDriverApi } from "@/api/backend";
import { createDriverWorkflow } from "@/api/driver-workflow";
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type PropsWithChildren } from "react";

import {
  appReducer,
  initialAppState,
  type AppAction,
  type AppState,
} from "./app-state";

const APP_STATE_STORAGE_KEY = "@drivacy/demo-state/v1";

export interface AuthenticatedDriverConnection {
  /** Backend /auth/me ID, not a caller-chosen demo identity. */
  userId: string;
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
}

function idempotencyKey(): string {
  return `mobile:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  isHydrated: boolean;
  backend?: {
    api: ReturnType<typeof createDriverApi>;
    workflow: ReturnType<typeof createDriverWorkflow>;
  };
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppProvider({ children, backendConnection, ephemeral = false }: PropsWithChildren<{ backendConnection?: AuthenticatedDriverConnection; ephemeral?: boolean }>) {
  const [state, dispatch] = useReducer(appReducer, backendConnection ? { ...initialAppState, source: "backend", setupPreviewCompleted: true } : initialAppState);
  const [isHydrated, setIsHydrated] = useState(false);
  const backendClient = useMemo(() => {
    if (!backendConnection) return undefined;
    const api = createDriverApi(backendConnection);
    return { api, workflow: createDriverWorkflow(api, AsyncStorage, idempotencyKey, backendConnection.userId) };
  }, [backendConnection]);
  const backend = state.demoMode ? undefined : backendClient;
  const stateStorageKey = backendConnection
    ? `${APP_STATE_STORAGE_KEY}/backend/${encodeURIComponent(backendConnection.userId)}`
    : APP_STATE_STORAGE_KEY;

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const storedState = ephemeral ? null : await AsyncStorage.getItem(stateStorageKey);
        if (storedState && isMounted) {
          dispatch({ type: "HYDRATE", persistedState: JSON.parse(storedState), mode: backendClient ? "backend" : linkedDemoEnabled ? "linked" : "local" });
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
  }, [backendClient, stateStorageKey, ephemeral]);

  useEffect(() => {
    if (isHydrated && !ephemeral) {
      void AsyncStorage.setItem(stateStorageKey, JSON.stringify(state));
    }
  }, [isHydrated, state, stateStorageKey, ephemeral]);

  const value = useMemo(
    () => ({ state, dispatch, isHydrated, backend }),
    [isHydrated, state, backend],
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
