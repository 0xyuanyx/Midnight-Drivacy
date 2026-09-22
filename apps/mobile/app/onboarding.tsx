import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppScreen } from "@/components/AppScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppState } from "@/state/app-provider";
import { colors, tokens } from "@/theme/tokens";

type ConsentDetail = "policy" | "driving" | null;

const detailCopy = {
  policy: {
    title: "보험 계약 및 특약 조회 동의",
    sections: [
      ["조회 목적", "가입한 자동차보험과 안전운전 할인 특약을 확인하고 선택할 수 있도록 사용합니다."],
      ["조회하는 정보", "보험사명, 상품명, 차량번호, 보험기간, 특약명과 계약 상태를 조회합니다."],
      ["이용 범위", "선택한 보험 정보를 이 로컬 데모 흐름 안에서만 사용합니다. 실제 보험사 조회나 제출은 수행하지 않습니다."],
    ],
  },
  driving: {
    title: "선택한 운행 기록 처리 동의",
    sections: [
      ["처리 목적", "선택한 모의 주행의 안전운전 점수와 할인 조건 충족 여부를 계산하기 위해 사용합니다."],
      ["처리하는 운행 정보", "모의 주행 거리, 안전운전 점수, 평가 기간과 할인 조건 충족 여부를 처리합니다."],
      ["보험사에 보내지 않는 정보", "정확한 위치, 이동 경로, 구간별 속도와 정확한 운행 시각은 보험사에 제공하지 않습니다."],
      ["데모 범위", "현재 앱은 결정된 로컬 데이터로 동작하며 실제 Midnight 증명이나 보험사 제출을 수행하지 않습니다."],
    ],
  },
} as const;

function CheckButton({ checked, index, onPress }: { checked: boolean; index: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${index + 1}번째 필수 동의`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={10}
      onPress={onPress}
      style={[styles.checkButton, checked && styles.checkButtonSelected]}
      testID={index === 0 ? "consent-row-privacy" : "consent-row-sharing"}
    >
      <Text style={[styles.checkmark, checked && styles.checkmarkSelected]}>✓</Text>
    </Pressable>
  );
}

function ConsentRow({ checked, index, onDetail, onToggle, title }: {
  checked: boolean;
  index: number;
  onDetail: () => void;
  onToggle: () => void;
  title: string;
}) {
  return (
    <View style={styles.consentRow}>
      <CheckButton checked={checked} index={index} onPress={onToggle} />
      <Pressable onPress={onToggle} style={styles.rowLabelButton}>
        <Text style={styles.rowLabel}>[필수] {title}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={`${title} 상세 보기`}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onDetail}
        style={styles.chevronButton}
      >
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { dispatch } = useAppState();
  const [consentSheetVisible, setConsentSheetVisible] = useState(false);
  const [consents, setConsents] = useState([false, false]);
  const [detail, setDetail] = useState<ConsentDetail>(null);
  const allConsentsAccepted = consents.every(Boolean);

  function closeConsentSheet() {
    setConsentSheetVisible(false);
    setConsents([false, false]);
    setDetail(null);
  }

  function toggleConsent(index: number) {
    setConsents((current) => current.map((checked, rowIndex) => (rowIndex === index ? !checked : checked)));
  }

  function acceptConsent() {
    if (!allConsentsAccepted) return;
    dispatch({ type: "ACCEPT_CONSENT" });
    closeConsentSheet();
    router.replace("/insurance");
  }

  const selectedDetail = detail ? detailCopy[detail] : null;

  return (
    <View style={styles.page}>
      <AppScreen
        contentContainerStyle={styles.screen}
        fixedFooter={<PrimaryButton title="동의하고 시작하기" onPress={() => setConsentSheetVisible(true)} />}
        scroll={false}
        testID="onboarding-screen"
      >
        <View style={styles.hero}>
          <Text style={styles.title}>안전운전 점수로{`\n`}보험료를 할인받아요.</Text>
          <Text style={styles.description}>운전 기록은 점수 계산에만 쓰고,{`\n`}보험사에는 할인 결과만 보내요.</Text>
        </View>
        <View accessibilityLabel="Drivacy" accessibilityRole="image" style={styles.logo}>
          <Text style={styles.logoText}>D</Text>
        </View>
      </AppScreen>
      {consentSheetVisible ? (
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityLabel="동의 창 닫기" accessibilityRole="button" onPress={closeConsentSheet} style={styles.backdropDismiss} />
          <SafeAreaView edges={["bottom"]} style={styles.sheetSafeArea} testID="consent-sheet-safe-area">
            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
              testID="consent-sheet-scroll"
            >
              {selectedDetail ? (
                <View style={styles.sheet}>
                  <Pressable
                    accessibilityLabel="동의 목록으로 돌아가기"
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setDetail(null)}
                    style={styles.detailBack}
                  >
                    <Text style={styles.detailBackIcon}>‹</Text>
                    <Text style={styles.detailBackText}>필수 동의</Text>
                  </Pressable>
                  <Text style={styles.detailTitle}>{selectedDetail.title}</Text>
                  <View style={styles.detailSections}>
                    {selectedDetail.sections.map(([heading, body]) => (
                      <View key={heading} style={styles.detailSection}>
                        <Text style={styles.detailHeading}>{heading}</Text>
                        <Text style={styles.detailBody}>{body}</Text>
                      </View>
                    ))}
                  </View>
                  <PrimaryButton title="확인" onPress={() => setDetail(null)} />
                </View>
              ) : (
                <View style={styles.sheet}>
                  <Text style={styles.sheetTitle}>DriVacy를 시작하려면{`\n`}아래 항목에 동의해 주세요.</Text>
                  <View style={styles.consentList}>
                    <ConsentRow checked={consents[0]} index={0} onDetail={() => setDetail("policy")} onToggle={() => toggleConsent(0)} title="보험 계약 및 특약 조회 동의" />
                    <ConsentRow checked={consents[1]} index={1} onDetail={() => setDetail("driving")} onToggle={() => toggleConsent(1)} title="선택한 운행 기록 처리 동의" />
                  </View>
                  <PrimaryButton disabled={!allConsentsAccepted} title="동의하고 계속하기" onPress={acceptConsent} testID="consent-continue" />
                  <PrimaryButton title="닫기" variant="ghost" onPress={closeConsentSheet} />
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  screen: { paddingBottom: 24, paddingTop: 72 },
  hero: { marginTop: 42 },
  title: { color: colors.textPrimary, fontSize: 31, fontWeight: "800", letterSpacing: -1, lineHeight: 41 },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginTop: 16 },
  logo: {
    alignItems: "center", alignSelf: "center", backgroundColor: colors.primary, borderRadius: 34, height: 132,
    justifyContent: "center", marginTop: 88, shadowColor: colors.primary, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18, shadowRadius: 22, transform: [{ rotate: "-4deg" }], width: 132,
  },
  logoText: { color: colors.surface, fontSize: 76, fontWeight: "900", letterSpacing: -8, transform: [{ rotate: "4deg" }] },
  modalBackdrop: { backgroundColor: "rgba(30, 30, 40, 0.34)", bottom: 0, justifyContent: "flex-end", left: 0, position: "absolute", right: 0, top: 0, zIndex: 1000 },
  backdropDismiss: { flex: 1 },
  sheetSafeArea: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, flexShrink: 1, maxHeight: "88%", overflow: "hidden" },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetScrollContent: { paddingBottom: 8 },
  sheet: { backgroundColor: colors.surface, padding: 24, paddingBottom: 20 },
  sheetTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", letterSpacing: -0.5, lineHeight: 30 },
  consentList: { marginBottom: 18, marginTop: 22 },
  consentRow: { alignItems: "center", flexDirection: "row", minHeight: 52 },
  checkButton: { alignItems: "center", borderColor: "#C6CBD4", borderRadius: 999, borderWidth: 1.5, height: 22, justifyContent: "center", width: 22 },
  checkButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: "transparent", fontSize: 13, fontWeight: "900" },
  checkmarkSelected: { color: colors.surface },
  rowLabelButton: { flex: 1, justifyContent: "center", minHeight: tokens.minTouchTarget, paddingLeft: 11 },
  rowLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  chevronButton: { alignItems: "flex-end", justifyContent: "center", minHeight: tokens.minTouchTarget, minWidth: tokens.minTouchTarget },
  chevron: { color: "#9A9FAA", fontSize: 30, fontWeight: "300", lineHeight: 32 },
  detailBack: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: tokens.minTouchTarget },
  detailBackIcon: { color: colors.primary, fontSize: 32, lineHeight: 34, marginRight: 4 },
  detailBackText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  detailTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.6, lineHeight: 32, marginTop: 6 },
  detailSections: { marginBottom: 22, marginTop: 18 },
  detailSection: { borderBottomColor: "#ECEEF2", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  detailHeading: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  detailBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 7 },
});
