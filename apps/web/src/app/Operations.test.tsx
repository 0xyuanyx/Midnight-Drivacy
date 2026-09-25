import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuleDraft } from "../api/backend";
import { Riders } from "./Operations";

const specialContractId = "11111111-1111-4111-8111-111111111111";
const draft: RuleDraft = {
  state: "draft", reviewRequired: true,
  values: { formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 },
  evidence: { speedingPenalty: "과속 2점", accelerationPenalty: "급가속 1점", brakingPenalty: "급제동 3점", minimumDistanceM: "500km", minimumScore: "80점", premiumMinimumScore: "90점", baseDiscountBps: "10%", premiumDiscountBps: "12%" },
  issues: [], provider: { name: "gemini", model: "gemini-test" },
};

async function openEditedPolicy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "규칙 변경" }));
  const file = new File(["500km"], "약관.txt", { type: "text/plain" });
  Object.defineProperty(file, "text", { value: async () => "500km" });
  await user.upload(screen.getByLabelText("특약 문서 업로드"), file);
  const content = await screen.findByLabelText("추출된 약관 내용");
  await user.clear(content);
  await user.type(content, "수정된 약관 500km 80점 10%");
}

describe("rider rule draft review", () => {
  it("shows a generated review-only draft from edited text", async () => {
    const user = userEvent.setup();
    const createRuleDraft = vi.fn(async () => draft);
    render(<Riders ruleDraftApi={{ createRuleDraft }} specialContractId={specialContractId} />);
    await openEditedPolicy(user);
    await user.click(screen.getByRole("button", { name: "규칙 초안 생성" }));

    expect(await screen.findByRole("spinbutton", { name: "최소 주행거리 (km)" })).toHaveValue(500);
    expect(screen.getByText("담당자 검토가 필요합니다.")).toBeInTheDocument();
    expect(screen.getByText("근거: 과속 2점")).toBeInTheDocument();
    expect(createRuleDraft).toHaveBeenCalledWith(specialContractId, "수정된 약관 500km 80점 10%");
    expect(screen.queryByText("승인 완료")).not.toBeInTheDocument();
  });

  it("keeps the text and allows manual entry when generation fails", async () => {
    const user = userEvent.setup();
    render(<Riders ruleDraftApi={{ createRuleDraft: async () => { throw new Error("서버 오류"); } }} specialContractId={specialContractId} />);
    await openEditedPolicy(user);
    await user.click(screen.getByRole("button", { name: "규칙 초안 생성" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("초안을 생성하지 못했습니다");
    await user.click(screen.getByRole("button", { name: "수기 보완" }));
    expect(screen.getByRole("spinbutton", { name: "최소 주행거리 (km)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2. 내용 확인·수정" }));
    expect(screen.getByLabelText("추출된 약관 내용")).toHaveValue("수정된 약관 500km 80점 10%");
  });

  it("treats a manual-required API result as editable input, not an approved rule", async () => {
    const user = userEvent.setup();
    const manual: RuleDraft = { ...draft, state: "manual_required", values: { ...draft.values, minimumDistanceM: null }, evidence: { ...draft.evidence, minimumDistanceM: null }, issues: ["UNVERIFIED_EXTRACTION"] };
    render(<Riders ruleDraftApi={{ createRuleDraft: async () => manual }} specialContractId={specialContractId} />);
    await openEditedPolicy(user);
    await user.click(screen.getByRole("button", { name: "규칙 초안 생성" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("수기로 확인");
    const distance = screen.getByRole("spinbutton", { name: "최소 주행거리 (km)" });
    expect(distance).toHaveValue(null);
    await user.type(distance, "500");
    expect(distance).toHaveValue(500);
    expect(screen.queryByText("승인 완료")).not.toBeInTheDocument();
  });

  it("does not replace revised text with an older in-flight draft", async () => {
    const user = userEvent.setup();
    let finish!: (result: RuleDraft) => void;
    render(<Riders ruleDraftApi={{ createRuleDraft: () => new Promise((resolve) => { finish = resolve; }) }} specialContractId={specialContractId} />);
    await openEditedPolicy(user);
    await user.click(screen.getByRole("button", { name: "규칙 초안 생성" }));
    await user.click(screen.getByRole("button", { name: "2. 내용 확인·수정" }));
    await user.type(screen.getByLabelText("추출된 약관 내용"), " 변경");
    finish(draft);
    await user.click(screen.getByRole("button", { name: "3. 규칙 초안" }));

    expect(screen.queryByRole("spinbutton", { name: "최소 주행거리 (km)" })).not.toBeInTheDocument();
  });
});
