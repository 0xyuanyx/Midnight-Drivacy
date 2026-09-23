const bridgeUrl = process.env.EXPO_PUBLIC_DEMO_BRIDGE_URL?.replace(/\/$/, "");
const applicationIdKey = "@drivacy/linked-demo-application-id/v1";
const submissionKeyKey = "@drivacy/linked-demo-submission-key/v1";

export const linkedDemoEnabled = Boolean(bridgeUrl);

export interface LinkedDemoApplication {
  id: string;
  policyId: string;
  riderName: string;
  score: number;
  distanceKm: number;
  expectedDiscountPercent: number;
  verificationStatus: "DEMO_UNVERIFIED";
  reviewStatus: "PENDING" | "APPLIED" | "REJECTED";
  submittedAt: string;
  decidedAt: string | null;
}

async function parseApplication(response: Response): Promise<LinkedDemoApplication> {
  if (!response.ok) throw new Error("신청 서버가 요청을 처리하지 못했습니다.");
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || typeof (value as LinkedDemoApplication).id !== "string") throw new Error("신청 응답 형식이 올바르지 않습니다.");
  return value as LinkedDemoApplication;
}

export async function submitLinkedDemoApplication(policyId: string): Promise<LinkedDemoApplication> {
  if (!bridgeUrl) throw new Error("신청 서버 주소가 설정되지 않았습니다.");
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  let submissionKey = await AsyncStorage.getItem(submissionKeyKey);
  if (!submissionKey) {
    submissionKey = `demo:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(submissionKeyKey, submissionKey);
  }
  const response = await fetch(`${bridgeUrl}/applications`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ policyId, submissionKey }) });
  const application = await parseApplication(response);
  await AsyncStorage.setItem(applicationIdKey, application.id);
  return application;
}

export async function getLinkedDemoApplication(): Promise<LinkedDemoApplication | null> {
  if (!bridgeUrl) return null;
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  const id = await AsyncStorage.getItem(applicationIdKey);
  if (!id) return null;
  const response = await fetch(`${bridgeUrl}/applications/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  return parseApplication(response);
}

export async function clearLinkedDemoApplication(): Promise<void> {
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.multiRemove([applicationIdKey, submissionKeyKey]);
}
