import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PolicyCard } from "@/components/PolicyCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { demoPolicies } from "@/fixtures/demo";
import { useAppState } from "@/state/app-provider";
import { colors } from "@/theme/tokens";

const INSURANCE_LOADING_DELAY_MS = 250;

export default function Insurance() {
  const router = useRouter();
  const { dispatch, state } = useAppState();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPolicyId, setSelectedPolicyId] = useState(state.selectedPolicyId);

  useEffect(() => {
    const loadingTimer = setTimeout(() => setIsLoading(false), INSURANCE_LOADING_DELAY_MS);
    return () => clearTimeout(loadingTimer);
  }, []);

  function confirmSelection() {
    if (!selectedPolicyId) {
      return;
    }

    dispatch({ type: "SELECT_INSURANCE", policyId: selectedPolicyId });
    router.replace("/(tabs)/home");
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="insurance-screen">
      <StatusPill tone="primary">내 보험 찾기</StatusPill>
      <Text style={styles.title}>가입한 보험을{`\n`}선택해 주세요</Text>
      <Text style={styles.description}>
        선택한 보험의 안전운전 할인 특약으로 데모 결과를 확인합니다.
      </Text>

      {isLoading ? (
        <View accessibilityLabel="보험 정보를 불러오는 중" style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>보험 정보를 불러오는 중</Text>
          <Text style={styles.loadingHint}>잠시만 기다려 주세요.</Text>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {demoPolicies.map((policy) => (
              <PolicyCard
                key={policy.id}
                onPress={() => setSelectedPolicyId(policy.id)}
                policy={policy}
                selected={selectedPolicyId === policy.id}
              />
            ))}
          </View>
          <View style={styles.footer}>
            <PrimaryButton
              disabled={!selectedPolicyId}
              title="이 보험 선택하기"
              onPress={confirmSelection}
            />
            <Text style={styles.footerNote}>선택한 보험 정보는 이 데모에서만 사용됩니다.</Text>
          </View>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 28,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 42,
    marginTop: 24,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  loadingState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 34,
    minHeight: 200,
    padding: 24,
  },
  loadingText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
  },
  loadingHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  list: {
    marginTop: 28,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 16,
  },
  footerNote: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
});
