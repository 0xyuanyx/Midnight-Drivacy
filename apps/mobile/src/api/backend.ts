export class DriverApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId?: string) { super(message); }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Config = { baseUrl: string; getAccessToken: () => Promise<string | null>; fetcher?: Fetcher };
type DrivingStart = { insuranceContractId: string; specialContractId: string; evaluationPeriod: string };

export function createDriverApi({ baseUrl, getAccessToken, fetcher = fetch }: Config) {
  const root = baseUrl.replace(/\/+$/, "");
  async function request(path: string, method: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new DriverApiError("AUTH_REQUIRED", "가입자 로그인이 필요합니다.");
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new DriverApiError("NETWORK_ERROR", "서버에 연결하지 못했습니다."); }
    let data: unknown;
    try { data = await response.json(); } catch { throw new DriverApiError("INVALID_RESPONSE", "서버 응답을 읽지 못했습니다."); }
    if (!response.ok) {
      const error = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
      throw new DriverApiError(typeof error.code === "string" ? error.code : "REQUEST_FAILED", typeof error.message === "string" ? error.message : "요청을 처리하지 못했습니다.", typeof error.requestId === "string" ? error.requestId : undefined);
    }
    return data;
  }
  return {
    getCurrentUser: () => request("/auth/me", "GET"),
    getConsent: () => request("/consent", "GET"),
    grantConsent: () => request("/consent", "POST", {}),
    listInsuranceContracts: () => request("/insurance-contracts", "GET"),
    getInsuranceContract: (id: string) => request(`/insurance-contracts/${encodeURIComponent(id)}`, "GET"),
    listSpecialContracts: (contractId: string) => request(`/insurance-contracts/${encodeURIComponent(contractId)}/special-contracts`, "GET"),
    getSpecialContractSelection: (contractId: string) => request(`/insurance-contracts/${encodeURIComponent(contractId)}/special-contract-selection`, "GET"),
    selectSpecialContract: (contractId: string, specialContractId: string) => request(`/insurance-contracts/${encodeURIComponent(contractId)}/special-contract-selection`, "PUT", { specialContractId }),
    startDrivingSession: (input: DrivingStart, idempotencyKey: string) => request("/driving-sessions", "POST", input, { "Idempotency-Key": idempotencyKey }),
    getDrivingSession: (id: string) => request(`/driving-sessions/${encodeURIComponent(id)}`, "GET"),
    endDrivingSession: (id: string) => request(`/driving-sessions/${encodeURIComponent(id)}/end`, "POST"),
  };
}
