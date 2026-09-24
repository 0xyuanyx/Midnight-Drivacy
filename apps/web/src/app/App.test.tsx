import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InsurerWorkspaceAdapter } from "../data/fixture-adapter";
import { applyDecision, createFixtureWorkspace } from "../domain/workspace";
import { App } from "./App";

describe("insurer workspace navigation", () => {
  it("preserves five menus and supports keyboard navigation through rider tabs", async () => {
    window.history.replaceState(null, "", "/riders");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    await user.click(await screen.findByRole("tab", { name: "현재 조건" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "규칙 변경" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "규칙 변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "현재 조건 보기" })).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "변경 이력" })).toHaveAttribute("aria-selected", "true");
  });
  it("uploads a rider document, edits its text, then opens rule draft review", async () => {
    window.history.replaceState(null, "", "/dashboard");
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "특약 관리" }));
    expect(window.location.pathname).toBe("/riders");
    await user.click(screen.getByRole("button", { name: "규칙 변경" }));
    expect(screen.getByRole("tab", { name: "규칙 변경" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("특약 문서 업로드")).toBeInTheDocument();
    const document = new File(["500km 이상"], "안전운전특약.txt", { type: "text/plain" });
    Object.defineProperty(document, "text", { value: async () => "500km 이상" });
    await user.upload(screen.getByLabelText("특약 문서 업로드"), document);
    const content = await screen.findByLabelText("추출된 약관 내용");
    expect(content).toHaveValue("500km 이상");
    await user.clear(content);
    await user.type(content, "550km 이상");
    await user.click(screen.getByRole("button", { name: "규칙 초안 생성" }));
    expect(screen.getByRole("alert")).toHaveTextContent("초안 서비스 연결과 보험사 로그인이 필요합니다");
    await user.click(screen.getByRole("button", { name: "문서 내용 다시 수정" }));
    expect(screen.getByLabelText("추출된 약관 내용")).toHaveValue("550km 이상");
  });

  it("labels fixture proof history and opens the existing evaluation detail", async () => {
    window.history.replaceState(null, "", "/history");
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "검증 이력", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("실제 ZK 검증", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("확인할 수 없음")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "평가 요청 상세로 이동" }));
    expect(window.location.pathname).toBe("/evaluations");
    expect(window.location.search).toContain("tab=proof");
  });

  it("keeps the selected request and detail tab in the URL", async () => {
    window.history.replaceState(null, "", "/dashboard?request=REQ-240921-018&tab=proof");
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "박민준 · DRV-260913-08" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "검증 결과" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "처리 이력" }));

    expect(window.location.search).toContain("request=REQ-240921-018");
    expect(window.location.search).toContain("tab=history");
  });

  it("switches between the two insurer workflows without losing a useful selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "평가 요청" }));

    expect(screen.getByRole("heading", { name: "평가 요청", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /박민준 · DRV-260913-08/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/evaluations");
  });

  it("keeps search and filter in the URL and resets them for another workflow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "필터" }));
    await user.type(await screen.findByPlaceholderText("이름, 요청 ID 검색"), "박민준");
    await user.selectOptions(screen.getByLabelText("상태 필터"), "pending");
    expect(window.location.search).toContain("q=%EB%B0%95%EB%AF%BC%EC%A4%80");
    expect(window.location.search).toContain("status=pending");

    await user.click(screen.getByRole("link", { name: "평가 요청" }));
    expect(window.location.search).not.toContain("q=");
    await user.click(screen.getByRole("button", { name: "필터" }));
    expect(screen.getByPlaceholderText("이름, 요청 ID 검색")).toHaveValue("");
  });

  it("moves focus into the decision dialog, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    const approve = await screen.findByRole("button", { name: "특약 승인" });

    await user.click(approve);
    const dialog = screen.getByRole("dialog", { name: "특약 요청을 승인할까요?" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(approve).toHaveFocus();
  });

  it("does not complete a decision when the adapter save fails", async () => {
    const adapter: InsurerWorkspaceAdapter = {
      load: async () => createFixtureWorkspace(),
      save: async () => { throw new Error("save failed"); },
    };
    const user = userEvent.setup();
    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "특약 승인" }));
    await user.click(screen.getByRole("button", { name: "결정 저장" }));

    expect(await screen.findByText("결정을 저장하지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결정 저장" })).toBeEnabled();
  });

  it("shows a retry state when the adapter cannot load", async () => {
    let attempts = 0;
    const adapter: InsurerWorkspaceAdapter = {
      load: async () => { attempts += 1; if (attempts === 1) throw new Error("load failed"); return createFixtureWorkspace(); },
      save: async () => undefined,
    };
    const user = userEvent.setup();
    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "박민준 · DRV-260913-08" })).toBeInTheDocument());
  });

  it("keeps keyboard navigation and the rendered detail tab together", async () => {
    const user = userEvent.setup();
    render(<App />);
    const info = await screen.findByRole("tab", { name: "요청 정보" });
    info.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "검증 결과" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "검증 결과" })).toBeInTheDocument();
    expect(window.location.search).toContain("tab=proof");
  });

  it("shows invalid proof details and disables approval for a review request", async () => {
    window.history.replaceState(null, "", "/dashboard?request=REQ-240920-097&tab=proof");
    render(<App />);
    expect(await screen.findByText("검증 정보 없음")).toBeInTheDocument();
    expect(screen.queryByText("증명 유효")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "특약 승인" })).toBeDisabled();
    expect(screen.getByText("검증 결과를 확인해 주세요")).toBeInTheDocument();
    expect(screen.queryByText("특약 요청을 승인할까요?")).not.toBeInTheDocument();
  });

  it("uses consistent SVG icons for header utilities", async () => {
    render(<App />);

    expect((await screen.findByRole("button", { name: "도움말" })).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "알림" }).querySelector("svg")).not.toBeNull();
  });

  it("distinguishes a rejected request from a generic completed state", async () => {
    const initial = createFixtureWorkspace();
    const rejected = applyDecision(initial, { workflow: "dashboard", requestId: "REQ-240921-018", decision: "rejected" });
    const adapter: InsurerWorkspaceAdapter = { load: async () => rejected, save: async () => undefined };
    window.history.replaceState(null, "", "/dashboard?request=REQ-240921-018&tab=info");

    render(<App adapter={adapter} />);

    expect(await screen.findByText("요청 반려")).toBeInTheDocument();
    expect(screen.getByText("특약 요청을 반려했습니다.")).toBeInTheDocument();
  });

  it("uses the Figma completion copy for a not-applied evaluation", async () => {
    const initial = createFixtureWorkspace();
    const notApplied = applyDecision(initial, { workflow: "evaluations", requestId: "EVL-240921-031", decision: "not-applied" });
    const adapter: InsurerWorkspaceAdapter = { load: async () => notApplied, save: async () => undefined };
    window.history.replaceState(null, "", "/evaluations?request=EVL-240921-031&tab=info");

    render(<App adapter={adapter} />);

    expect(await screen.findByText("할인 미적용")).toBeInTheDocument();
    expect(screen.getByText("할인 미적용으로 처리되었습니다.")).toBeInTheDocument();
  });
});
