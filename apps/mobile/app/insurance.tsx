import { typography } from "@/theme/typography";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PolicyCard } from "@/components/PolicyCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { demoPolicies, type DemoPolicy } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

const INSURANCE_LOADING_DELAY_MS = 250;

interface BackendPolicyOption { contractId: string; specialContractId: string; policy: DemoPolicy }

function backendPolicyOptions(input: unknown): BackendPolicyOption[] {
  if (!Array.isArray(input)) throw new Error("보험 조회 응답이 올바르지 않습니다.");
  return input.flatMap((contract): BackendPolicyOption[] => {
    if (!contract || typeof contract !== "object" || typeof contract.id !== "string"
      || typeof contract.insurerName !== "string" || !Array.isArray(contract.specialContracts)) {
      throw new Error("보험 조회 응답이 올바르지 않습니다.");
    }
    return contract.specialContracts.filter((rider: { isEligible?: boolean }) => rider.isEligible === true)
      .map((rider: { id: string; name: string; status: string }) => ({
        contractId: contract.id, specialContractId: rider.id,
        policy: { id: `${contract.id}:${rider.id}`, insurerName: contract.insurerName,
          productName: `자동차보험 · ${rider.name}`, riderName: rider.name,
          statusLabel: contract.status, vehicleNumber: "서버 제공 정보 없음",
          coveragePeriod: `${String(contract.coverageStartsAt).slice(0, 10)}–${String(contract.coverageEndsAt).slice(0, 10)}` },
      }));
  });
}

export default function Insurance() {
  const router = useRouter();
  const { dispatch, state, backend } = useAppState();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPolicyId, setSelectedPolicyId] = useState(state.selectedPolicyId);
  const [backendOptions, setBackendOptions] = useState<BackendPolicyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const confirming = useRef(false);
  const showDemoPolicies = Boolean(backend && !isLoading && !error && backendOptions.length === 0);
  const fixturePolicies = !backend || showDemoPolicies;

  useEffect(() => {
    if (backend) {
      let active = true;
      void backend.api.listInsuranceContracts().then((result) => {
        if (active) { setBackendOptions(backendPolicyOptions(result)); setIsLoading(false); }
      }).catch(() => { if (active) { setError("보험 정보를 불러오지 못했습니다. 다시 시도해 주세요."); setIsLoading(false); } });
      return () => { active = false; };
    }
    const loadingTimer = setTimeout(() => setIsLoading(false), INSURANCE_LOADING_DELAY_MS);
    return () => clearTimeout(loadingTimer);
  }, [backend]);

  async function confirmSelection() {
    if (!selectedPolicyId || confirming.current) {
      return;
    }

    confirming.current = true;
    if (backend && !showDemoPolicies) {
      const option = backendOptions.find((item) => item.policy.id === selectedPolicyId);
      if (!option) { confirming.current = false; return; }
      try {
        await backend.api.selectSpecialContract(option.contractId, option.specialContractId);
        const periods = await backend.api.listEvaluationPeriods(option.contractId, option.specialContractId);
        if (!Array.isArray(periods) || periods.length !== 1 || !periods[0]
          || typeof periods[0].id !== "string") throw new Error("평가기간을 확인할 수 없습니다.");
        dispatch({ type: "SELECT_BACKEND_INSURANCE", policyId: option.contractId,
          specialContractId: option.specialContractId, evaluationPeriod: periods[0].id });
        router.replace("/(tabs)/home");
      } catch {
        setError("보험·특약의 평가기간을 확인하지 못했습니다. 다시 시도해 주세요.");
        confirming.current = false;
      }
      return;
    }
    dispatch({ type: showDemoPolicies ? "SELECT_DEMO_INSURANCE" : "SELECT_INSURANCE", policyId: selectedPolicyId });
    router.replace("/(tabs)/home");
  }

  return (
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={isLoading ? undefined : (
        <View style={styles.footer}>
          {fixturePolicies ? <Text style={styles.demoNote}>표시된 보험은 데모용 예시이며 실제 가입 계약이 아니에요.</Text> : null}
          <PrimaryButton disabled={!selectedPolicyId} title="이 보험 선택하기" onPress={confirmSelection} />
        </View>
      )}
      testID="insurance-screen"
    >
      <ScreenHeader title="내 보험 조회하기" onBack={() => router.replace("/consent")} />
      <Text style={styles.title}>{fixturePolicies ? "데모 보험을 선택해주세요." : "가입한 보험을 확인해주세요."}</Text>
      <Text style={styles.description}>{fixturePolicies ? "예시 보험으로 화면 흐름을 체험할 수 있어요." : "할인 특약을 신청할 보험계약을 선택해요."}</Text>

      {isLoading ? (
        <View accessibilityLabel="보험 정보를 불러오는 중" style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>보험 정보를 불러오는 중</Text>
          <Text style={styles.loadingHint}>잠시만 기다려 주세요.</Text>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {(backend && !showDemoPolicies ? backendOptions.map((option) => option.policy) : demoPolicies).map((policy) => (
              <PolicyCard
                key={policy.id}
                onPress={() => setSelectedPolicyId(policy.id)}
                policy={policy}
                selected={selectedPolicyId === policy.id}
              />
            ))}
          </View>
        </>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 28,
  },
  title: { ...typography.title, color: colors.textPrimary, marginTop: 28 },
  description: { ...typography.body,
    color: colors.textSecondary,
    marginTop: 8,
  },
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 28,
    minHeight: 200,
    padding: 24,
  },
  loadingText: { ...typography.cardTitle,
    color: colors.textPrimary,
    marginTop: 14,
  },
  loadingHint: { ...typography.caption,
    color: colors.textSecondary,
    marginTop: 6,
  },
  list: {
    marginTop: 24,
  },
  error: { ...typography.caption, color: "#C12D39", marginTop: 16 },
  footer: { gap: 10 },
  demoNote: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
