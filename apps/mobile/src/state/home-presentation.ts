import type { AppState } from "./app-state";

/** Home and Documents share one application lifecycle, including resumption. */
export function homePresentation(state: AppState) {
  if (state.applicationStage === "approved") return {
    action: "할인 결과 확인하기", route: "/application" as const,
    title: "할인 신청 결과를\n확인해 보세요.", status: "할인 적용 완료", detail: `안전운전 할인 ${state.totals.expectedDiscountPercent}% · 서류에서 결과를 확인하세요.`,
  };
  if (state.applicationStage === "pending") return {
    action: "신청 내역 확인하기", route: "/application" as const,
    title: "할인 신청을 마쳤어요.\n검토 결과를 기다려 주세요.", status: "신청 검토 중", detail: "제출한 정보와 신청 내역을 서류에서 확인하세요.",
  };
  if (state.driveStage === "active") return {
    action: "모의 주행으로 돌아가기", route: "/drive-session" as const,
    title: "모의 주행이\n진행 중이에요.", status: "주행 진행 중", detail: "주행을 종료하면 결과가 반영돼요.",
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
    action: state.tripsCompleted === 0 ? "첫 모의 주행 시작" : "두 번째 모의 주행 시작", route: "/drive" as const,
    title: "민준님, 이번 달도\n안전하게 달리고 있어요.", status: "할인 조건 준비 중", detail: `누적 ${state.totals.distanceKm} / 550 km · ${state.tripsCompleted} / 2회 주행`,
  };
}
