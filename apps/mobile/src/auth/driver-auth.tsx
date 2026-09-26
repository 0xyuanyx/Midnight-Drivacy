import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator } from "react-native";
import { createDriverApi } from "@/api/backend";
import { AppProvider, type AuthenticatedDriverConnection } from "@/state/app-provider";
import type { SetupServices } from "@/components/setup/services";
import { backendBaseUrl } from "./config";

export interface EmailAuthAdapter {
  ready: boolean;
  userId: string | null;
  sendCode(email: string): Promise<unknown>;
  verifyCode(email: string, code: string): Promise<unknown>;
  getAccessToken(): Promise<string | null>;
}

const DriverAuthContext = createContext<SetupServices | null>(null);
export const useDriverAuthServices = () => useContext(DriverAuthContext);

export function driverId(response: unknown): string {
  if (!response || typeof response !== "object" || !("role" in response) || response.role !== "DRIVER"
    || !("id" in response) || typeof response.id !== "string" || !response.id) {
    throw new Error("가입자 계정을 확인할 수 없습니다.");
  }
  return response.id;
}

export function DriverAuthSession({ adapter, children }: PropsWithChildren<{ adapter: EmailAuthAdapter }>) {
  const latest = useRef(adapter);
  latest.current = adapter;
  const [identity, setIdentity] = useState<{ privyId: string; driverId: string } | null>(null);
  const token = useMemo(() => () => latest.current.getAccessToken(), []);
  const api = useMemo(() => createDriverApi({ baseUrl: backendBaseUrl, getAccessToken: token }), [token]);

  useEffect(() => {
    let active = true;
    setIdentity(null);
    if (!adapter.ready || !adapter.userId || !backendBaseUrl) return;
    const privyId = adapter.userId;
    void api.getCurrentUser().then(response => {
      const id = driverId(response);
      if (active) setIdentity({ privyId, driverId: id });
    }).catch(() => { /* Setup can retry provisioning; never use an unverified local identity. */ });
    return () => { active = false; };
  }, [adapter.ready, adapter.userId, api]);

  const services = useMemo<SetupServices>(() => ({
    preview: false,
    sendCode: async email => { await latest.current.sendCode(email); },
    verifyCode: async (email, code) => { await latest.current.verifyCode(email, code); },
    completeProfile: async profile => {
      if (!backendBaseUrl) throw new Error("가입 정보 저장 서버 연결을 준비 중이에요. 잠시 후 다시 시도해주세요.");
      const owner = latest.current.userId;
      if (!owner) throw new Error("이메일 인증을 다시 진행해주세요.");
      const id = driverId(await api.completeDriverOnboarding(profile));
      if (latest.current.userId !== owner) throw new Error("로그인 계정이 변경됐어요. 다시 시도해주세요.");
      setIdentity({ privyId: owner, driverId: id });
    },
    createWallet: async () => { throw new Error("월렛 연결은 아직 준비 중이에요."); },
    connectWallet: async () => { throw new Error("월렛 연결은 아직 준비 중이에요."); },
  }), [api]);
  const connection = useMemo<AuthenticatedDriverConnection | undefined>(() => identity && identity.privyId === adapter.userId
    ? { userId: identity.driverId, baseUrl: backendBaseUrl, getAccessToken: token } : undefined, [identity, adapter.userId, token]);
  if (!adapter.ready) return <ActivityIndicator accessibilityLabel="로그인 상태 확인 중" />;
  return <DriverAuthContext.Provider value={services}>
    <AppProvider key={connection?.userId ?? "signed-out"} backendConnection={connection} ephemeral={!connection}>{children}</AppProvider>
  </DriverAuthContext.Provider>;
}
