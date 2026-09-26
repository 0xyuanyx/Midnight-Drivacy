import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CircleAlert, CircleDot, CircleHelp, FileCheck2, Search } from "lucide-react";
import { fixtureAdapter, type InsurerWorkspaceAdapter } from "../data/fixture-adapter";
import { applyDecision, getDashboardMetrics, getEvaluationMetrics, getEvaluationOutcome, type DashboardRequest, type EvaluationRequest, type WorkspaceState } from "../domain/workspace";
import { readLocation, toUrl, type DetailTab, type LocationState, type RequestWorkflow, type Workflow } from "./navigation";
import { Connections, Riders, VerificationHistory } from "./Operations";
import { LinkedEvaluations, LinkedVerificationHistory, linkedDemoEnabled } from "./LinkedEvaluations";
import { BackendEvaluations, BackendVerificationHistory } from "./BackendEvaluations";
import type { InsurerApi } from "../api/backend";

const tabsByWorkflow: Record<RequestWorkflow, Array<{ id: DetailTab; label: string }>> = {
  dashboard: [{ id: "info", label: "요청 정보" }, { id: "proof", label: "검증 결과" }, { id: "history", label: "처리 이력" }],
  evaluations: [{ id: "info", label: "평가 결과" }, { id: "proof", label: "증명 검증" }, { id: "history", label: "처리 이력" }],
};

type Confirmation = {
  workflow: RequestWorkflow;
  requestId: string;
  decision: "approved" | "rejected" | "applied" | "not-applied";
  title: string;
  description: string;
} | null;

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "danger" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

function Brand() { return <div className="brand" aria-label="DriVacy 보험사"><span className="brand-name">Dri<span>Vacy</span></span><small>INSURER</small></div>; }

function SideNav({ active, onNavigate }: { active: Workflow; onNavigate: (workflow: Workflow) => void }) {
  return <aside className="sidebar">
    <Brand />
    <nav className="primary-nav" aria-label="주요 메뉴">
      <a href="/dashboard" className={active === "dashboard" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("dashboard"); }}><i />대시보드</a>
      <a href="/evaluations" className={active === "evaluations" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("evaluations"); }}><i />평가 요청</a>
      <a href="/riders" className={active === "riders" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("riders"); }}><i />특약 관리</a>
      <a href="/history" className={active === "history" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("history"); }}><i />검증 이력</a>
      <a href="/connections" className={active === "connections" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("connections"); }}><i />연동 상태</a>
    </nav>
    <div className="account-card"><span className="avatar">미</span><span><strong>미래손해보험</strong><small>상품운영팀</small></span></div>
  </aside>;
}

function PageHeader({ workflow, onUtility }: { workflow: Workflow; onUtility: (name: string) => void }) {
  const titles: Record<Workflow, [string, string]> = { dashboard: ["대시보드", "오늘 처리할 특약 승인 요청과 안전운전 평가를 확인합니다."], evaluations: ["평가 요청", "안전운전 할인특약 평가 결과를 검증하고 처리합니다."], riders: ["특약 관리", "특약 조건을 확인하고 변경할 문서를 올려 내용을 수정합니다."], history: ["검증 이력", "신청 기록을 찾고 평가 요청 상세로 이동합니다."], connections: ["연동 상태", "서비스별 연결 상태를 확인합니다."] };
  return <header className="page-header">
    <div><h1>{titles[workflow][0]}</h1><p>{titles[workflow][1]}</p></div>
    <div className="header-actions"><button aria-label="도움말" className="icon-button" type="button" onClick={() => onUtility("도움말")}><CircleHelp size={15} strokeWidth={1.8} /></button><button aria-label="알림" className="icon-button" type="button" onClick={() => onUtility("알림")}><Bell size={15} strokeWidth={1.8} /></button><button className="profile-button" aria-label="계정" onClick={() => onUtility("계정")}>김</button></div>
  </header>;
}

function SummaryGrid({ workflow, state }: { workflow: RequestWorkflow; state: WorkspaceState }) {
  const dashboard = getDashboardMetrics(state);
  const evaluations = getEvaluationMetrics(state);
  // Historical fixture totals precede the four visible requests; new decisions add to them.
  const processed = 11 + dashboard.completed;
  const approved = 7 + state.requests.filter((item) => item.decision === "approved").length;
  const applied = 11 + state.evaluations.filter((item) => item.decision === "applied").length;
  const items = workflow === "dashboard"
    ? [["특약 승인 대기", dashboard.pending + dashboard.review, "지금 처리할 요청"], ["오늘 처리", processed, `어제보다 +${processed - 8}`], ["승인 완료", approved, `승인율 ${(approved / processed * 100).toFixed(1)}%`], ["검토 필요", dashboard.review, "증명 확인 필요"]]
    : [["오늘 접수", 18, "어제보다 +4"], ["검증 대기", evaluations.awaiting + evaluations.failed, "평균 2분 이내"], ["할인 적용", applied, `적용률 ${(applied / 18 * 100).toFixed(1)}%`], ["검증 실패", evaluations.failed, "확인 필요"]];
  return <section className="summary-grid" aria-label="업무 요약">{items.map(([label, value, helper], index) => <article className="summary-card" key={String(label)}><span>{label}</span><strong>{value}</strong><small className={index === 3 ? "danger-text" : ""}>{helper}</small></article>)}</section>;
}

function RequestList({ workflow, state, selectedId, query, filter, onSelect, onQuery, onFilter }: { workflow: RequestWorkflow; state: WorkspaceState; selectedId: string; query: string; filter: LocationState["filter"]; onSelect: (id: string) => void; onQuery: (query: string) => void; onFilter: (filter: LocationState["filter"]) => void }) {
  const [toolsOpen, setToolsOpen] = useState(Boolean(query) || filter !== "all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const source = workflow === "dashboard" ? state.requests : state.evaluations;
  const filtered = source.filter((item) => {
    if (!`${item.applicantName} ${item.id} ${item.displayId} ${item.contractNumber}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "pending") return item.status === "pending" || item.status === "verified";
    if (filter === "review") return item.status === "review" || item.status === "failed";
    return item.status === "completed";
  });
  return <section className="panel list-panel" aria-label={workflow === "dashboard" ? "특약 요청 목록" : "평가 요청 목록"}>
    <div className="panel-heading"><div><h2>{workflow === "dashboard" ? "특약 승인 요청" : "평가 요청"}</h2><span>{workflow === "dashboard" ? `대기 ${source.filter((item) => item.decision === "pending").length}건` : `총 ${20 + source.length}건`}</span></div><div className="list-heading-actions"><button className="compact-button" type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>필터</button><button className="compact-button" type="button" onClick={() => setOldestFirst(!oldestFirst)}>{oldestFirst ? "오래된순" : "최신순"}⌄</button></div></div>
    {toolsOpen ? <div className="list-tools"><label className="search-field"><Search size={14} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="이름, 요청 ID 검색" /></label><select aria-label="상태 필터" value={filter} onChange={(event) => onFilter(event.target.value as LocationState["filter"])}><option value="all">전체 상태</option><option value="pending">결정 대기</option><option value="review">검토 필요</option><option value="completed">처리 완료</option></select></div> : null}
    <div className="list-columns"><span>가입자 / {workflow === "dashboard" ? "요청번호" : "신청번호"}</span><span>{workflow === "dashboard" ? "할인" : "점수"}</span><span>{workflow === "dashboard" ? "상태" : "검증"}</span><span>접수</span></div>
    <div className="request-list">
      {filtered.length === 0 ? <div className="empty-state"><Search size={22} /><strong>검색 결과가 없습니다.</strong><span>검색어나 상태 필터를 바꿔보세요.</span></div> : null}
      {(oldestFirst ? filtered.slice().reverse() : filtered).map((item) => {
        const selected = selectedId === item.id;
        const completed = item.status === "completed";
        const caution = item.proofStatus === "invalid";
        return <button key={item.id} type="button" className={`request-row ${selected ? "selected" : ""}`} onClick={() => onSelect(item.id)} aria-pressed={selected}>
          <span className="request-person"><strong>{item.applicantName}</strong><small>{item.displayId}</small></span><strong className="row-metric">{workflow === "evaluations" ? item.result.score : getEvaluationOutcome(item).eligible ? `${getEvaluationOutcome(item).discountPercent}%` : "미충족"}</strong><span><StatusBadge tone={completed ? "neutral" : caution ? "danger" : "success"}>{completed ? workflow === "dashboard" ? item.decision === "rejected" ? "반려" : "승인 완료" : "처리 완료" : caution ? workflow === "dashboard" ? "검토 필요" : "확인 필요" : workflow === "dashboard" ? "승인 대기" : "검증 정보 없음"}</StatusBadge></span><time>{item.requestedAt}</time>
        </button>;
      })}
    </div>
  </section>;
}

function HistoryList({ entries }: { entries: DashboardRequest["history"] }) {
  return <div className="history-list">{entries.map((entry, index) => <div className="history-item" key={`${entry.at}-${index}`}><span className={`history-dot ${entry.tone}`} /><span><time>{entry.at}</time> {entry.summary}</span></div>)}</div>;
}

function DashboardDetail({ request, tab }: { request: DashboardRequest; tab: DetailTab }) {
  if (tab === "history") return <HistoryList entries={request.history} />;
  return tab === "proof" ? <ProofDetail /> : <ResultDetail item={request} />;
}

function EvaluationDetail({ evaluation, tab }: { evaluation: EvaluationRequest; tab: DetailTab }) {
  if (tab === "history") return <HistoryList entries={evaluation.history} />;
  return tab === "proof" ? <ProofDetail /> : <ResultDetail item={evaluation} />;
}

function ResultDetail({ item }: { item: DashboardRequest | EvaluationRequest }) {
  const outcome = getEvaluationOutcome(item);
  return <div className="detail-stack"><div className="result-hero"><div className="score-result"><span>최종 안전운전 점수</span><strong>{item.result.score}</strong><small>/ 100점</small></div><div className="discount-result"><span>해당 할인 구간</span><strong>{outcome.eligible ? `${outcome.discountPercent}%` : "미충족"}</strong><small>{outcome.eligible ? "보험료 할인" : "조건 미달"}</small></div></div><dl className="result-grid"><div><dt>평가기간</dt><dd>{item.result.evaluationPeriod}</dd></div><div><dt>누적 주행거리</dt><dd>{item.result.accumulatedDistanceKm} km</dd></div><div><dt>적용 규칙</dt><dd>{item.rule.version}</dd></div><div><dt>최소 조건</dt><dd>{item.rule.minimumScore}점 · {item.rule.minimumDistanceKm} km</dd></div></dl><div className="privacy-note"><span className="privacy-icon"><CircleDot size={15} strokeWidth={1.8} /></span><div><strong>원본 주행기록은 제공되지 않았습니다</strong><p>정확한 위치, 이동경로, 운행시각과 구간별 속도 없이 승인된 계산 결과만 표시됩니다.</p></div></div></div>;
}

function ProofDetail() {
  const rows = ["규칙 해시", "Dataset Root", "상태 커밋먼트", "Nullifier"];
  return <div className="detail-stack"><div className="verification-card unavailable"><span className="verification-icon"><CircleAlert size={18} strokeWidth={2.2} /></span><div><strong>검증 정보 없음</strong><p>증명 및 체인 검증 결과가 연결되지 않았습니다.</p></div></div><div className="proof-table">{rows.map((label) => <div className="proof-row" key={label}><span>{label}</span><code>—</code><strong>확인 전</strong></div>)}</div></div>;
}

function ActionBar({ workflow, item, onConfirm }: { workflow: RequestWorkflow; item: DashboardRequest | EvaluationRequest; onConfirm: (confirmation: NonNullable<Confirmation>) => void }) {
  if (item.status === "completed") {
    const result = workflow === "dashboard" ? (item as DashboardRequest).decision === "approved" ? "특약 요청을 승인했습니다." : "특약 요청을 반려했습니다." : (item as EvaluationRequest).decision === "applied" ? "할인 적용 처리가 완료되었습니다." : "할인 미적용으로 처리되었습니다.";
    return <div className={`action-complete ${item.decision === "rejected" || item.decision === "not-applied" ? "negative" : ""}`}><strong>{result}</strong><span>처리 완료</span></div>;
  }
  const blocked = item.proofStatus !== "valid";
  if (workflow === "dashboard") return <div className="action-bar"><div><strong>{blocked ? "검증 결과를 확인해 주세요" : "특약 요청을 승인할까요?"}</strong><span>{blocked ? "검증 실패 사유를 확인한 뒤 다시 처리해 주세요." : "검증 결과를 확인한 뒤 승인해 주세요."}</span></div><div className="action-buttons"><button className="button secondary" type="button" disabled={blocked} onClick={() => onConfirm({ workflow, requestId: item.id, decision: "rejected", title: "특약 요청을 반려할까요?", description: `${item.applicantName}님의 요청이 처리 완료로 이동합니다.` })}>요청 반려</button><button className="button primary" type="button" disabled={blocked} onClick={() => onConfirm({ workflow, requestId: item.id, decision: "approved", title: "특약 요청을 승인할까요?", description: `${item.applicantName}님의 특약 가입 요청을 승인합니다.` })}>특약 승인</button></div></div>;
  const evaluation = item as EvaluationRequest;
  const outcome = getEvaluationOutcome(evaluation);
  return <div className="action-bar"><div><strong>{outcome.eligible ? "할인 적용 여부를 결정해 주세요" : "검증 결과와 할인 조건을 확인해 주세요"}</strong><span>{outcome.eligible ? "결정 결과를 저장하고 처리 이력에 남깁니다." : "조건을 충족한 유효한 증명만 처리할 수 있습니다."}</span></div><div className="action-buttons"><button className="button secondary" type="button" disabled={!outcome.eligible} onClick={() => onConfirm({ workflow, requestId: item.id, decision: "not-applied", title: "할인을 적용하지 않을까요?", description: `${item.applicantName}님의 평가 요청을 미적용으로 완료합니다.` })}>미적용</button><button className="button primary" type="button" disabled={!outcome.eligible} onClick={() => onConfirm({ workflow, requestId: item.id, decision: "applied", title: `${outcome.discountPercent}% 할인을 적용할까요?`, description: `${item.applicantName}님의 보험료 할인 결정을 저장합니다.` })}>할인 적용</button></div></div>;
}

function DetailPanel({ workflow, item, tab, onTab, onConfirm }: { workflow: RequestWorkflow; item: DashboardRequest | EvaluationRequest; tab: DetailTab; onTab: (tab: DetailTab) => void; onConfirm: (confirmation: NonNullable<Confirmation>) => void }) {
  const completedStatus = workflow === "dashboard" ? (item as DashboardRequest).decision === "rejected" ? "요청 반려" : "승인 완료" : (item as EvaluationRequest).decision === "not-applied" ? "할인 미적용" : "할인 적용";
  const status = item.status === "completed" ? completedStatus : workflow === "dashboard" ? item.proofStatus === "invalid" ? "검토 필요" : "승인 대기" : "검증 정보 없음";
  const statusTone = item.proofStatus === "invalid" || item.decision === "rejected" || item.decision === "not-applied" ? "danger" : "success";
  return <section className={`panel detail-panel tab-${tab}`}>
    <div className="detail-heading"><div><span className="detail-eyebrow">{workflow === "dashboard" ? "특약 요청 상세" : "평가 상세"}</span><h2>{item.applicantName} · {item.displayId}</h2><p>{item.productName} · {item.riderName}</p></div><StatusBadge tone={statusTone}>{status}</StatusBadge></div>
    <div className="detail-tabs" role="tablist" aria-label="요청 상세">{tabsByWorkflow[workflow].map((entry, index, entries) => <button key={entry.id} id={`tab-${entry.id}`} aria-controls="detail-content" tabIndex={tab === entry.id ? 0 : -1} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => onTab(entry.id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % entries.length : event.key === "ArrowLeft" ? (index + entries.length - 1) % entries.length : event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : -1; if (next >= 0) { event.preventDefault(); onTab(entries[next].id); document.getElementById(`tab-${entries[next].id}`)?.focus(); } }}>{entry.label}</button>)}</div>
    <div className="detail-content" id="detail-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>{workflow === "dashboard" ? <DashboardDetail request={item as DashboardRequest} tab={tab} /> : <EvaluationDetail evaluation={item as EvaluationRequest} tab={tab} />}</div>
    <ActionBar workflow={workflow} item={item} onConfirm={onConfirm} />
  </section>;
}

function ConfirmDialog({ confirmation, busy, error, onCancel, onApply }: { confirmation: NonNullable<Confirmation>; busy: boolean; error: string | null; onCancel: () => void; onApply: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [busy, onCancel]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onCancel(); }}><div ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="dialog-icon"><FileCheck2 size={22} /></span><h2 id="confirm-title">{confirmation.title}</h2><p>{confirmation.description}</p><div className="dialog-notice"><CircleAlert size={16} /> 현재 보험 계약 시스템과 연결되지 않아 계약 정보는 변경되지 않습니다.</div>{error ? <p className="dialog-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button ref={cancelRef} className="button secondary" type="button" disabled={busy} onClick={onCancel}>취소</button><button className="button primary" type="button" disabled={busy} onClick={onApply}>{busy ? "저장 중…" : "결정 저장"}</button></div></div></div>;
}

export function App({ adapter = fixtureAdapter, ruleDraftApi, specialContractId, insurerApi }: { adapter?: InsurerWorkspaceAdapter; ruleDraftApi?: Pick<InsurerApi, "createRuleDraft">; specialContractId?: string; insurerApi?: InsurerApi }) {
  const [utility, setUtility] = useState<string | null>(null);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [location, setLocation] = useState<LocationState>(() => readLocation());
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoadError(false);
    adapter.load().then((loaded) => { if (active) setState(loaded); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [adapter, loadAttempt]);
  useEffect(() => { const onPopState = () => setLocation(readLocation()); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  const requestWorkflow = location.workflow === "dashboard" || location.workflow === "evaluations" ? location.workflow : null;
  const source = state && requestWorkflow ? requestWorkflow === "dashboard" ? state.requests : state.evaluations : [];
  const selected = useMemo(() => source.find((item) => item.id === location.requestId) ?? source[0], [source, location.requestId]);
  useEffect(() => { if (!selected || !requestWorkflow) return; const next = { ...location, requestId: selected.id }; const target = toUrl(next); if (`${window.location.pathname}${window.location.search}` !== target) window.history.replaceState(null, "", target); }, [location, selected]);
  const updateLocation = (next: LocationState, replace = false) => { window.history[replace ? "replaceState" : "pushState"](null, "", toUrl(next)); setLocation(next); };
  const navigate = (workflow: Workflow, requestId: string | null = null, tab: DetailTab = "info") => updateLocation({ workflow, requestId, tab, query: workflow === location.workflow ? location.query : "", filter: workflow === location.workflow ? location.filter : "all" });
  const openConfirmation = (next: NonNullable<Confirmation>) => { setSaveError(null); setConfirmation(next); };
  const applyConfirmedDecision = async () => {
    if (!confirmation || !state) return;
    const next = applyDecision(state, confirmation.workflow === "dashboard" ? { workflow: "dashboard", requestId: confirmation.requestId, decision: confirmation.decision as "approved" | "rejected" } : { workflow: "evaluations", requestId: confirmation.requestId, decision: confirmation.decision as "applied" | "not-applied" });
    setSaving(true);
    setSaveError(null);
    try { await adapter.save(next); setState(next); setConfirmation(null); }
    catch { setSaveError("결정을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };
  return <>
    <div className="app-shell" aria-hidden={confirmation || utility ? true : undefined}>
      <SideNav active={location.workflow} onNavigate={(workflow) => navigate(workflow)} />
      <main className="main-content">
        <PageHeader workflow={location.workflow} onUtility={setUtility} />
        {location.workflow === "connections" ? <Connections /> : insurerApi && location.workflow === "evaluations" ? <BackendEvaluations api={insurerApi} /> : insurerApi && location.workflow === "history" ? <BackendVerificationHistory api={insurerApi} /> : linkedDemoEnabled && location.workflow === "evaluations" ? <LinkedEvaluations /> : linkedDemoEnabled && location.workflow === "history" ? <LinkedVerificationHistory /> : !state ? <section className="panel async-state">{loadError ? <><CircleAlert size={24} /><strong>요청을 불러오지 못했습니다.</strong><span>잠시 후 다시 시도해 주세요.</span><button className="button primary" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>다시 불러오기</button></> : <><span className="loading-dot" /><strong>업무 요청을 불러오는 중입니다.</strong></>}</section> : location.workflow === "riders" ? <Riders ruleDraftApi={ruleDraftApi} specialContractId={specialContractId} /> : location.workflow === "history" ? <VerificationHistory state={state} onOpenEvaluation={(id) => navigate("evaluations", id, "proof")} /> : requestWorkflow ? <>
          <SummaryGrid workflow={requestWorkflow} state={state} />
          {requestWorkflow === "dashboard" ? <div className="workflow-banner"><div><strong>승인 업무는 대시보드에서 처리해요</strong><p>특약 관리에서는 조건과 할인율을 확인합니다. 가입자 요청 승인과 규칙 변경은 별도 업무입니다.</p></div><button type="button" onClick={() => { const pending = state.requests.find((item) => item.status === "pending"); if (pending) navigate("dashboard", pending.id); }}>대기 요청 처리 →</button></div> : null}
          <div className="workspace-grid"><RequestList key={requestWorkflow} workflow={requestWorkflow} state={state} selectedId={selected?.id ?? ""} query={location.query} filter={location.filter} onQuery={(query) => updateLocation({ ...location, query }, true)} onFilter={(filter) => updateLocation({ ...location, filter })} onSelect={(id) => navigate(requestWorkflow, id, location.tab)} />{selected ? <DetailPanel workflow={requestWorkflow} item={selected} tab={location.tab} onTab={(tab) => navigate(requestWorkflow, selected.id, tab)} onConfirm={openConfirmation} /> : <section className="panel empty-detail"><strong>선택할 요청이 없습니다.</strong></section>}</div>
        </> : null}
      </main>
    </div>
    {confirmation ? <ConfirmDialog confirmation={confirmation} busy={saving} error={saveError} onCancel={() => setConfirmation(null)} onApply={applyConfirmedDecision} /> : null}
    {utility ? <UtilityDialog name={utility} onClose={() => setUtility(null)} /> : null}
  </>;
}

function UtilityDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const content: Record<string, string> = { "도움말": "현재 화면은 업무 흐름을 표시합니다. 대시보드에서는 특약 승인 요청을, 평가 요청에서는 할인 적용 결정을 확인합니다. 특약 관리에는 규칙 변환 화면을 통합했고 연동 상태는 읽기 전용입니다. 실제 보험 API와 Midnight 네트워크는 연결되지 않았습니다.", "알림": "새로운 알림이 없습니다.", "계정": "미래손해보험 · 상품운영팀 · 담당자" };
  return <dialog className="utility-dialog" ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><h2>{name}</h2><p>{content[name]}</p><button className="button primary" onClick={onClose}>닫기</button></dialog>;
}
