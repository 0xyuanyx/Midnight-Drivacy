import { createDriverApi } from "./backend";

const contractId = "11111111-1111-4111-8111-111111111111";
const specialContractId = "22222222-2222-4222-8222-222222222222";

describe("driver backend boundary", () => {
  it("keeps consent and selection payloads server-owned", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return { ok: true, status: 200, json: async () => ({ consented: true }) } as Response;
    };
    const api = createDriverApi({ baseUrl: "https://api.example.test/", getAccessToken: async () => "driver-token", fetcher });

    await api.grantConsent();
    await api.selectSpecialContract(contractId, specialContractId);

    expect(calls[0]).toEqual(["https://api.example.test/consent", expect.objectContaining({ method: "POST", body: "{}" })]);
    expect(calls[1]).toEqual([`https://api.example.test/insurance-contracts/${contractId}/special-contract-selection`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ specialContractId }) })]);
    expect(calls[1][1].headers).toEqual({ Authorization: "Bearer driver-token", "Content-Type": "application/json" });
  });

  it("sends the driving idempotency key only as a header", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const api = createDriverApi({ baseUrl: "https://api.example.test", getAccessToken: async () => "token", fetcher: async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ id: "session" }) } as Response; } });
    await api.startDrivingSession({ insuranceContractId: contractId, specialContractId, evaluationPeriod: "period-1" }, "retry-key");
    expect(calls[0][1]).toEqual(expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json", "Idempotency-Key": "retry-key" }, body: JSON.stringify({ insuranceContractId: contractId, specialContractId, evaluationPeriod: "period-1" }) }));
  });

  it("does not request private data without authentication", async () => {
    const fetcher = jest.fn();
    const api = createDriverApi({ baseUrl: "https://api.example.test", getAccessToken: async () => null, fetcher });
    await expect(api.listInsuranceContracts()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
