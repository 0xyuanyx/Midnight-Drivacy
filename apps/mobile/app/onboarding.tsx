import { useState, type ComponentProps, type ComponentType } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppScreen } from "@/components/AppScreen";
import { BrandMark } from "@/components/BrandMark";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill } from "@/components/StatusPill";
import { useAppState } from "@/state/app-provider";
import { colors, tokens } from "@/theme/tokens";

interface ConsentRowProps {
  checked: boolean;
  description: string;
  eyebrow: string;
  label: string;
  onPress: () => void;
  testID: string;
  title: string;
}

type WebCheckboxProps = ComponentProps<typeof View> & {
  onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => void;
  onKeyUp: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => void;
};

const WebCheckboxView = View as unknown as ComponentType<WebCheckboxProps>;

function ConsentRow({ checked, description, eyebrow, label, onPress, testID, title }: ConsentRowProps) {
  const contents = (
    <>
      <View style={[styles.checkbox, checked && styles.checkedBox]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <View style={styles.consentContent}>
        <View style={styles.consentMetaRow}>
          <Text style={styles.consentEyebrow}>{eyebrow}</Text>
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>필수</Text>
          </View>
        </View>
        <Text style={styles.consentTitle}>{title}</Text>
        <Text style={styles.consentDescription}>{description}</Text>
      </View>
    </>
  );

  if (Platform.OS === "web") {
    return (
      <WebCheckboxView
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        aria-checked={checked}
        onResponderRelease={onPress}
        onStartShouldSetResponder={() => true}
        onKeyDown={(event) => {
          if (["Enter", " ", "Space", "Spacebar"].includes(event.nativeEvent.key)) {
            event.preventDefault();
            onPress();
          }
        }}
        onKeyUp={(event) => {
          if ([" ", "Space", "Spacebar"].includes(event.nativeEvent.key)) {
            event.preventDefault();
          }
        }}
        style={styles.consentRow}
        tabIndex={0}
        testID={testID}
      >
        {contents}
      </WebCheckboxView>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.consentRow, pressed && styles.consentRowPressed]}
      testID={testID}
    >
      {contents}
    </Pressable>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { dispatch } = useAppState();
  const [consentSheetVisible, setConsentSheetVisible] = useState(false);
  const [consents, setConsents] = useState([false, false]);

  const allConsentsAccepted = consents.every(Boolean);

  function closeConsentSheet() {
    setConsentSheetVisible(false);
    setConsents([false, false]);
  }

  function toggleConsent(index: number) {
    setConsents((current) => current.map((checked, rowIndex) => (rowIndex === index ? !checked : checked)));
  }

  function acceptConsent() {
    if (!allConsentsAccepted) {
      return;
    }

    dispatch({ type: "ACCEPT_CONSENT" });
    closeConsentSheet();
    router.replace("/insurance");
  }

  return (
    <AppScreen contentContainerStyle={styles.screen} testID="onboarding-screen">
      <View style={styles.brandRow}>
        <BrandMark />
        <StatusPill tone="primary">개인정보 보호 데모</StatusPill>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>안전운전 할인, 더 안전하게</Text>
        <Text style={styles.title}>상세 주행기록을{`\n`}공개하지 않고 확인해요</Text>
        <Text style={styles.description}>
          보험사가 확인하는 것은 할인 조건을 충족했는지에 대한 요약 결과입니다.
          위치·경로·구간별 속도와 정확한 운행 시각은 보험사에 전달하지 않습니다.
        </Text>
      </View>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>Drivacy가 지키는 정보</Text>
        <Text style={styles.explanationText}>
          이 앱은 결정된 데모 데이터로 동작하며, 실제 보험사 제출이나 Midnight 증명 처리를 수행하지 않습니다.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="동의하고 시작하기" onPress={() => setConsentSheetVisible(true)} />
        <Text style={styles.footerNote}>필수 동의 후 내 보험을 확인할 수 있어요.</Text>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closeConsentSheet}
        transparent
        visible={consentSheetVisible}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="동의 창 닫기"
            accessibilityRole="button"
            onPress={closeConsentSheet}
            style={styles.backdropDismiss}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={styles.sheetSafeArea}
            testID="consent-sheet-safe-area"
          >
            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
              testID="consent-sheet-scroll"
            >
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>필수 동의</Text>
                    <Text style={styles.sheetSubtitle}>서비스를 시작하기 전에 확인해 주세요.</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="닫기"
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={closeConsentSheet}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeText}>닫기</Text>
                  </Pressable>
                </View>

                <ConsentRow
                  checked={consents[0]}
                  description="선택한 보험, 안전운전 점수, 누적 주행 거리와 할인 조건 충족 여부를 이 데모에서 처리합니다."
                  eyebrow="처리하는 정보"
                  label="개인정보 처리와 주행 결과 확인에 동의합니다"
                  onPress={() => toggleConsent(0)}
                  testID="consent-row-privacy"
                  title="개인정보 처리 및 주행 결과 확인"
                />
                <ConsentRow
                  checked={consents[1]}
                  description="보험사명, 특약명, 평가기간, 점수·누적 거리와 예상 할인율만 제공합니다."
                  eyebrow="보험사에 제공하는 요약"
                  label="보험사에 요약 결과를 제공하는 데 동의합니다"
                  onPress={() => toggleConsent(1)}
                  testID="consent-row-sharing"
                  title="요약 결과 제공"
                />

                <View style={styles.protectedInfo}>
                  <Text style={styles.protectedInfoTitle}>제공하지 않는 정보</Text>
                  <Text style={styles.protectedInfoValue}>
                    정확한 위치·이동 경로·구간별 속도·정확한 운행 시각
                  </Text>
                </View>
                <Text style={styles.sheetNote}>
                  이 동의는 로컬 데모 진행에만 사용되며 실제 보험사 제출은 수행하지 않습니다.
                </Text>
                <PrimaryButton
                  disabled={!allConsentsAccepted}
                  title="동의하고 계속하기"
                  onPress={acceptConsent}
                  testID="consent-continue"
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 28,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hero: {
    marginTop: 72,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 44,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 20,
  },
  explanationCard: {
    backgroundColor: colors.surface,
    borderRadius: tokens.cardRadius,
    marginTop: 34,
    padding: 18,
  },
  explanationTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  explanationText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 36,
  },
  footerNote: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  modalBackdrop: {
    backgroundColor: "rgba(30, 30, 40, 0.36)",
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropDismiss: {
    flex: 1,
  },
  sheetSafeArea: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flexShrink: 1,
    maxHeight: "88%",
    overflow: "hidden",
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingBottom: 16,
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: 24,
    paddingBottom: 32,
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: "800",
  },
  sheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  closeButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: tokens.minTouchTarget,
    minWidth: tokens.minTouchTarget,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  consentRow: {
    alignItems: "flex-start",
    backgroundColor: "#F8F9FB",
    borderColor: "#E4E7ED",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: tokens.minTouchTarget,
    marginBottom: 12,
    padding: 16,
  },
  consentRowPressed: {
    opacity: 0.72,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#C4CAD4",
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
    width: 24,
  },
  checkedBox: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  consentContent: {
    flex: 1,
  },
  consentMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  consentEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  requiredBadge: {
    backgroundColor: "#EAF0FF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  requiredText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  consentTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 6,
  },
  consentDescription: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  protectedInfo: {
    backgroundColor: "#EEF4FF",
    borderRadius: 14,
    padding: 14,
  },
  protectedInfoTitle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  protectedInfoValue: {
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  sheetNote: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    marginTop: 12,
  },
});
