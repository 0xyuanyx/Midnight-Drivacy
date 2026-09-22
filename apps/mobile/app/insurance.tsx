import { typography } from "@/theme/typography";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/AppScreen";
import { PolicyCard } from "@/components/PolicyCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
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
    <AppScreen
      contentContainerStyle={styles.screen}
      fixedFooter={isLoading ? undefined : (
        <PrimaryButton disabled={!selectedPolicyId} title="이 보험 선택하기" onPress={confirmSelection} />
      )}
      testID="insurance-screen"
    >
      <ScreenHeader title="내 보험 조회하기" />
      <Text style={styles.title}>가입한 보험을 확인해주세요.</Text>
      <Text style={styles.description}>할인 특약을 신청할 보험계약을 선택해요.</Text>

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
        </>
      )}
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
});
