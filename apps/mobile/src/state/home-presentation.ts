import type { AppState } from "./app-state";
import { demoRule } from "@/fixtures/demo";

/** Home and Documents share one application lifecycle, including resumption. */
export function homePresentation(state: AppState) {
  if (state.applicationStage === "rejected") return {
    action: "할인 결과 확인하기", route: "/application" as const,
    title: "할인 신청 결과를\n확인해 보세요.", status: "미적용 결정", detail: "보험사 결정 결과를 서류에서 확인하세요.",
  };
  if (state.applicationStage === "approved") return {
    action: "할인 결과 확인하기", route: "/application" as const,
    title: state.source === "backend" ? "할인 신청 결과를\n확인해 보세요." : "데모 결과를\n확인해 보세요.",
    status: state.source === "backend" ? "적용 결정 완료" : "데모 결과 확인",
    detail: state.source === "backend"
      ? `안전운전 할인 ${state.totals.expectedDiscountPercent}% · 서류에서 결과를 확인하세요.`
      : `예상 할인 ${state.totals.expectedDiscountPercent}% 예시 · 실제 보험사 결정이 아니에요.`,
  };
  if (state.applicationStage === "pending") return {
    action: "신청 내역 확인하기", route: "/application" as const,
    title: state.source === "backend" ? "할인 신청을 마쳤어요.\n검토 결과를 기다려 주세요." : "데모 신청을\n기록했어요.",
    status: state.source === "backend" ? "신청 검토 중" : "데모 신청 기록",
    detail: state.source === "backend" ? "제출한 정보와 신청 내역을 서류에서 확인하세요." : "실제 보험사 제출 없이 서류에서 예시를 확인하세요.",
  };
  if (state.driveStage === "active") return {
    action: "주행 체험으로 돌아가기", route: "/drive-session" as const,
    title: "주행 체험이\n진행 중이에요.", status: "주행 진행 중", detail: "주행을 종료하면 결과가 반영돼요.",
  };
  if (state.driveStage === "processing") return {
    action: "주행 처리 확인하기", route: "/drive-processing" as const,
    title: "주행 결과를\n정리하고 있어요.", status: "주행 처리 중", detail: "처리가 끝나면 신청 조건을 확인할 수 있어요.",
  };
  if (state.driveStage === "result") return {
    action: "주행 결과 보기", route: "/drive-result" as const,
    title: "이번 주행 결과가\n도착했어요.", status: "주행 처리 완료", detail: "변경된 점수와 누적 거리를 확인하세요.",
  };
  if (state.totals.isEligible) return {
    action: "할인 신청하기", route: "/application" as const,
    title: "할인 신청 조건을\n충족했어요.", status: "할인 신청 가능", detail: "서류에서 제공할 정보를 확인하고 신청하세요.",
  };
  return {
    action: state.tripsCompleted === 0 ? "첫 주행 체험 시작" : "두 번째 주행 체험 시작", route: "/drive" as const,
    title: "이번 달도\n안전하게 달려봐요.", status: "할인 조건 준비 중", detail: state.source === "backend"
      ? `서버 확정 누적 ${state.totals.distanceKm} km · ${state.tripsCompleted}회 주행`
      : `누적 ${state.totals.distanceKm} / ${demoRule.minimumDistanceKm} km · ${state.tripsCompleted} / 2회 주행`,
  };
}
