import { useCallback, useEffect, useMemo, useState } from "react";
import type { InsurerApi } from "../api/backend";

interface Application {
  id: string;
  specialContractName: string;
  score: number;
  distanceM: number;
  expectedDiscountBps: number;
  appliedDiscountBps: number | null;
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
  reviewStatus: "PENDING_REVIEW" | "APPLIED" | "REJECTED";
  submittedAt: string;
}

function parseApplications(input: unknown): Application[] {
  if (!Array.isArray(input)) throw new Error("신청 목록 응답이 올바르지 않습니다.");
  return input.map((value: unknown) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (typeof row.id !== "string" || typeof row.specialContractName !== "string"
      || typeof row.score !== "number" || typeof row.distanceM !== "number"
      || typeof row.expectedDiscountBps !== "number" || typeof row.submittedAt !== "string"
      || !["PENDING", "VERIFIED", "FAILED"].includes(String(row.verificationStatus))
      || !["PENDING_REVIEW", "APPLIED", "REJECTED"].includes(String(row.reviewStatus))) {
      throw new Error("신청 목록 응답이 올바르지 않습니다.");
    }
    return {
      id: row.id, specialContractName: row.specialContractName, score: row.score,
      distanceM: row.distanceM, expectedDiscountBps: row.expectedDiscountBps,
      appliedDiscountBps: typeof row.appliedDiscountBps === "number" ? row.appliedDiscountBps : null,
      verificationStatus: row.verificationStatus as Application["verificationStatus"],
      reviewStatus: row.reviewStatus as Application["reviewStatus"], submittedAt: row.submittedAt,
    };
  });
}

const verificationLabel = (status: Application["verificationStatus"]) => status === "VERIFIED" ? "검증 완료" : status === "FAILED" ? "검증 실패" : "검증 중";
const reviewLabel = (status: Application["reviewStatus"]) => status === "APPLIED" ? "적용 결정" : status === "REJECTED" ? "미적용 결정" : "결정 대기";

function useBackendApplications(api: Pick<InsurerApi, "listDiscountApplications">) {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { setItems(parseApplications(await api.listDiscountApplications())); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { items, loading, error, refresh };
}

export function BackendEvaluations({ api }: { api: Pick<InsurerApi, "listDiscountApplications" | "decideDiscountApplication"> }) {
  const { items, loading, error, refresh } = useBackendApplications(api);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(false);
  const filtered = useMemo(() => items.filter((item) => `${item.id} ${item.specialContractName}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const canDecide = selected?.verificationStatus === "VERIFIED" && selected.reviewStatus === "PENDING_REVIEW";
  async function decide(decision: "APPLIED" | "REJECTED") {
    if (!selected || !canDecide || busy) return;
    setBusy(true); setDecisionError(false);
    try { await api.decideDiscountApplication(selected.id, decision); await refresh(); }
    catch { setDecisionError(true); }
    finally { setBusy(false); }
  }
  return <>
    <div className="workflow-banner"><div><strong>가입자 앱 신청</strong><p>Backend 검증 완료와 보험사 적용 결정을 구분합니다.</p></div><button type="button" onClick={() => { void refresh(); }}>새로고침 →</button></div>
    {error ? <p className="operations-note operations-top-note" role="alert">신청 정보를 불러오지 못했습니다. 인증과 연결 상태를 확인해 주세요.</p> : null}
    <div className="workspace-grid"><section className="panel" aria-label="앱 신청 목록"><div className="panel-heading"><div><h2>평가 요청</h2><span>{loading ? "불러오는 중" : `${filtered.length}건`}</span></div></div><div className="list-tools"><label className="search-field"><input aria-label="연동 신청 검색" placeholder="신청 ID 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><div className="operations-list-head"><span>신청 / 특약</span><span>검증</span></div>{filtered.length === 0 ? <div className="empty-state">{loading ? "신청을 불러오는 중입니다." : "가입자 신청이 없습니다."}</div> : filtered.map((item) => <button key={item.id} type="button" aria-label={item.id} className={`operations-list-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><span><strong>{item.id}</strong><small>{item.specialContractName}</small></span><span>{verificationLabel(item.verificationStatus)}</span></button>)}</section>
      <section className="panel detail-panel" aria-label="연동 신청 상세">{selected ? <><div className="detail-heading"><div><span className="detail-eyebrow">평가 요청 상세</span><h2>앱 신청 {selected.id}</h2><p>제출 {new Date(selected.submittedAt).toLocaleString("ko-KR")}</p></div><span className="status-badge">{reviewLabel(selected.reviewStatus)}</span></div><div className="detail-content operations-stack"><div className="operations-card"><div className="operations-card-head">확정 결과</div><div className="operations-row"><span>안전운전 점수</span><strong>{selected.score}점</strong></div><div className="operations-row"><span>누적 주행거리</span><strong>{selected.distanceM / 1000} km</strong></div><div className="operations-row"><span>예상 할인</span><strong>{selected.expectedDiscountBps / 100}%</strong></div></div><div className="operations-card"><div className="operations-card-head">처리 상태</div><div className="operations-row"><span>증명 검증</span><strong>{verificationLabel(selected.verificationStatus)}</strong></div><div className="operations-row"><span>보험사 결정</span><strong>{reviewLabel(selected.reviewStatus)}</strong></div>{selected.reviewStatus === "APPLIED" ? <div className="operations-row"><span>적용 할인</span><strong>{(selected.appliedDiscountBps ?? 0) / 100}%</strong></div> : null}</div>{decisionError ? <p className="operations-note danger-text" role="alert">결정을 저장하지 못했습니다. 상태를 확인하고 다시 시도해 주세요.</p> : null}</div><div className="operations-panel-foot"><span>{canDecide ? "검증된 신청만 결정할 수 있습니다." : "검증 또는 결정 상태를 확인해 주세요."}</span><div className="action-buttons"><button className="button secondary" disabled={!canDecide || busy} type="button" onClick={() => { void decide("REJECTED"); }}>미적용 결정</button><button className="button primary" disabled={!canDecide || busy} type="button" onClick={() => { void decide("APPLIED"); }}>할인 적용 결정</button></div></div></> : <div className="empty-state">선택할 신청이 없습니다.</div>}</section></div>
  </>;
}

export function BackendVerificationHistory({ api }: { api: Pick<InsurerApi, "listDiscountApplications"> }) {
  const { items, loading, error, refresh } = useBackendApplications(api);
  return <><div className="workflow-banner"><div><strong>앱 신청 검증 이력</strong><p>증명 검증과 보험사 결정의 최신 서버 상태입니다.</p></div><button type="button" onClick={() => { void refresh(); }}>새로고침 →</button></div>{error ? <p className="operations-note operations-top-note" role="alert">검증 이력을 불러오지 못했습니다.</p> : null}<section className="panel operations-connections" aria-label="연동 검증 이력"><div className="panel-heading"><div><h2>검증 이력</h2><span>{loading ? "불러오는 중" : `${items.length}건`}</span></div></div>{items.length === 0 ? <div className="empty-state">신청이 없습니다.</div> : items.map((item) => <div className="operations-connection" key={item.id}><strong>{item.id}</strong><small>{item.specialContractName} · {reviewLabel(item.reviewStatus)}</small><span className="status-badge">{verificationLabel(item.verificationStatus)}</span></div>)}</section></>;
}
