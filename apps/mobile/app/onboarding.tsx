import { typography } from "@/theme/typography";
import { useState } from "react";
import brandImage from "../assets/images/drivacy-3d.png";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
      ["이용 범위", "선택한 보험 정보는 신청 화면에서 사용합니다. 실제 보험계약 조회는 연결되지 않았습니다."],
    ],
  },
  driving: {
    title: "선택한 운행 기록 처리 동의",
    sections: [
      ["처리 목적", "선택한 주행 체험의 안전운전 점수와 할인 조건 충족 여부를 계산하기 위해 사용합니다."],
      ["처리하는 운행 정보", "주행 체험 거리, 안전운전 점수, 평가 기간과 할인 조건 충족 여부를 처리합니다."],
      ["보험사에 보내지 않는 정보", "정확한 위치, 이동 경로, 구간별 속도와 정확한 운행 시각은 보험사에 제공하지 않습니다."],
      ["서비스 연결 상태", "보험계약 시스템과 증명 생성 서비스는 아직 연결되지 않았습니다."],
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

export default function Onboarding({ startWithConsent = false }: { startWithConsent?: boolean }) {
  const router = useRouter();
  const { state, dispatch, backend } = useAppState();
  const [pageHeight, setPageHeight] = useState(874);
  const compact = pageHeight < 700;
  const [consentSheetVisible, setConsentSheetVisible] = useState(startWithConsent);
  const [consents, setConsents] = useState([state.hasConsented, state.hasConsented]);
  const [detail, setDetail] = useState<ConsentDetail>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const allConsentsAccepted = consents.every(Boolean);

  function closeConsentSheet() {
    setConsentSheetVisible(false);
    setConsents([state.hasConsented, state.hasConsented]);
    setDetail(null);
    setConsentError(null);
  }

  function dismissConsentSheet() {
    closeConsentSheet();
    if (startWithConsent && state.hasConsented) router.replace("/insurance");
  }

  function toggleConsent(index: number) {
    setConsents((current) => current.map((checked, rowIndex) => (rowIndex === index ? !checked : checked)));
  }

  async function acceptConsent() {
    if (!allConsentsAccepted || savingConsent) return;
    if (backend) {
      setSavingConsent(true);
      setConsentError(null);
      try { await backend.api.grantConsent(); }
      catch {
        setConsentError("동의를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
        setSavingConsent(false);
        return;
      }
    }
    dispatch({ type: "ACCEPT_CONSENT" });
    closeConsentSheet();
    router.replace("/insurance");
  }

  const selectedDetail = detail ? detailCopy[detail] : null;

  return (
    <View style={styles.page} onLayout={event => setPageHeight(event.nativeEvent.layout.height)}>
      <AppScreen
        contentContainerStyle={[styles.screen, compact && styles.compactScreen]}
        fixedFooter={<PrimaryButton title={state.setupPreviewCompleted ? "동의하고 시작하기" : "시작하기"} onPress={() => state.setupPreviewCompleted ? setConsentSheetVisible(true) : router.replace("/setup")} />}
        testID="onboarding-screen"
      >
        <View style={[styles.hero, compact && styles.compactHero]}>
          <Text style={styles.title}>안전운전 점수로{`\n`}보험료를 할인받아요.</Text>
          <Text style={styles.description}>운전 기록은 점수 계산에만 쓰고,{`\n`}보험사에는 할인 결과만 보내요.</Text>
        </View>
        <Image accessibilityLabel="Drivacy 3D V 로고" source={brandImage} resizeMode="contain" style={[styles.brandImage, compact && styles.compactBrandImage]} />
      </AppScreen>
      {consentSheetVisible ? (
        <View style={[styles.modalBackdrop, Platform.OS === "web" && styles.webBackdrop]} testID="consent-backdrop">
          <Pressable accessibilityLabel="동의 창 닫기" accessibilityRole="button" onPress={dismissConsentSheet} style={styles.backdropDismiss} />
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
                        <Text style={styles.detailBody}>{backend && heading === "이용 범위"
                          ? "Backend에 저장된 계약을 조회합니다. 보험사 운영 시스템 직접 연동 여부는 별도로 확인해야 합니다."
                          : backend && heading === "서비스 연결 상태"
                            ? "Backend의 모의 운행 처리 상태를 조회합니다. 실제 월렛 승인과 체인 확정은 상태별로 확인합니다."
                            : body}</Text>
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
                  <PrimaryButton disabled={!allConsentsAccepted || savingConsent} title={savingConsent ? "동의 저장 중…" : "동의하고 계속하기"} onPress={() => { void acceptConsent(); }} testID="consent-continue" />
                  {consentError ? <Text accessibilityRole="alert" style={styles.consentError}>{consentError}</Text> : null}
                  <PrimaryButton title="닫기" variant="ghost" onPress={dismissConsentSheet} />
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
  brandImage: { alignSelf: "center", width: 200, height: 205, marginTop: 80, flexShrink: 0 },
  compactBrandImage: { width: 220, height: 180, marginTop: 20 },
  compactScreen: { paddingTop: 36 },
  compactHero: { marginTop: 20 },
  page: { flex: 1 },
  screen: { paddingBottom: 24, paddingTop: 72 },
  hero: { marginTop: 42 },
  title: { ...typography.display, color: colors.textPrimary, },
  description: { ...typography.body, color: colors.textSecondary, marginTop: 8 },
  modalBackdrop: { backgroundColor: "rgba(30, 30, 40, 0.34)", bottom: 0, justifyContent: "flex-end", left: 0, position: "absolute", right: 0, top: 0, zIndex: 1000 },
  webBackdrop: { top: -22 },
  backdropDismiss: { flex: 1 },
  sheetSafeArea: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, flexShrink: 1, maxHeight: "88%", overflow: "hidden" },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetScrollContent: { paddingBottom: 8 },
  sheet: { backgroundColor: colors.surface, padding: 24, paddingBottom: 20 },
  sheetTitle: { ...typography.sheetTitle, color: colors.textPrimary, },
  consentList: { marginBottom: 18, marginTop: 22 },
  consentRow: { alignItems: "center", flexDirection: "row", minHeight: 52 },
  checkButton: { alignItems: "center", borderColor: "#C6CBD4", borderRadius: 999, borderWidth: 1.5, height: 22, justifyContent: "center", width: 22 },
  checkButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: "transparent", fontSize: 13, fontWeight: "900" },
  checkmarkSelected: { color: colors.surface },
  rowLabelButton: { flex: 1, justifyContent: "center", minHeight: tokens.minTouchTarget, paddingLeft: 11 },
  rowLabel: { ...typography.body, color: colors.textPrimary, },
  chevronButton: { alignItems: "flex-end", justifyContent: "center", minHeight: tokens.minTouchTarget, minWidth: tokens.minTouchTarget },
  chevron: { color: "#9A9FAA", fontSize: 30, fontWeight: "300", lineHeight: 32 },
  detailBack: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: tokens.minTouchTarget },
  detailBackIcon: { color: colors.primary, fontSize: 32, lineHeight: 34, marginRight: 4 },
  detailBackText: { ...typography.label, color: colors.primary, },
  detailTitle: { ...typography.title, color: colors.textPrimary, marginTop: 6 },
  detailSections: { marginBottom: 22, marginTop: 18 },
  detailSection: { borderBottomColor: "#ECEEF2", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  detailHeading: { ...typography.cardTitle, color: colors.textPrimary, },
  detailBody: { ...typography.body, color: colors.textSecondary, marginTop: 7 },
  consentError: { ...typography.caption, color: "#C12D39", marginBottom: 12 },
});
