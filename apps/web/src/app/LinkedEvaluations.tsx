import { useCallback, useEffect, useMemo, useState } from "react";

const bridgeUrl = import.meta.env.VITE_DEMO_BRIDGE_URL?.replace(/\/$/, "") as string | undefined;
export const linkedDemoEnabled = Boolean(bridgeUrl);

interface LinkedApplication {
  id: string;
  policyId: string;
  riderName: string;
  score: number;
  distanceKm: number;
  expectedDiscountPercent: number;
  verificationStatus: "DEMO_UNVERIFIED";
  reviewStatus: "PENDING" | "APPLIED" | "REJECTED";
  submittedAt: string;
  decidedAt: string | null;
}

function useApplications() {
  const [items, setItems] = useState<LinkedApplication[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!bridgeUrl) return;
    try {
      const response = await fetch(`${bridgeUrl}/applications`, { cache: "no-store" });
      if (!response.ok) throw new Error("Bridge request failed");
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error("Bridge response invalid");
      setItems(body as LinkedApplication[]);
      setError(false);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { items, error, loading, refresh };
}

const reviewLabel = (status: LinkedApplication["reviewStatus"]) => status === "PENDING" ? "검토 중" : status === "APPLIED" ? "적용 결정" : "미적용 결정";

export function LinkedEvaluations() {
  const { items, error, loading, refresh } = useApplications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(false);
  const filtered = useMemo(() => items.filter((item) => `${item.id} ${item.riderName}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const decide = async (decision: "APPLIED" | "REJECTED") => {
    if (!bridgeUrl || !selected || busy) return;
    setBusy(true);
    setDecisionError(false);
    try {
      const response = await fetch(`${bridgeUrl}/applications/${encodeURIComponent(selected.id)}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!response.ok) throw new Error("Decision failed");
      await refresh();
    } catch { setDecisionError(true); }
    finally { setBusy(false); }
  };
  return <>
    <div className="workflow-banner"><div><strong>가입자 앱 신청</strong><p>앱에서 접수된 신청과 처리 결과를 확인합니다. 증명 검증 상태는 별도로 표시합니다.</p></div><button type="button" onClick={() => { void refresh(); }}>새로고침 →</button></div>
    {error ? <p className="operations-note operations-top-note" role="alert">신청 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
    <div className="workspace-grid"><section className="panel" aria-label="앱 신청 목록"><div className="panel-heading"><div><h2>평가 요청</h2><span>{loading ? "불러오는 중" : `${filtered.length}건`}</span></div></div><div className="list-tools"><label className="search-field"><input aria-label="연동 신청 검색" placeholder="신청 ID 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><div className="operations-list-head"><span>신청 / 특약</span><span>처리</span></div>{filtered.length === 0 ? <div className="empty-state">{loading ? "신청을 불러오는 중입니다." : "앱에서 제출된 신청이 없습니다."}</div> : filtered.map((item) => <button key={item.id} type="button" className={`operations-list-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><span><strong>{item.id.slice(0, 8)}</strong><small>{item.riderName}</small></span><span>{reviewLabel(item.reviewStatus)}</span></button>)}</section>
      <section className="panel detail-panel" aria-label="연동 신청 상세">{selected ? <><div className="detail-heading"><div><span className="detail-eyebrow">평가 요청 상세</span><h2>앱 신청 {selected.id.slice(0, 8)}</h2><p>제출 {new Date(selected.submittedAt).toLocaleString("ko-KR")}</p></div><span className="status-badge">{reviewLabel(selected.reviewStatus)}</span></div><div className="detail-content operations-stack"><div className="operations-card"><div className="operations-card-head">제출한 평가 결과</div><div className="operations-row"><span>안전운전 점수</span><strong>{selected.score}점</strong></div><div className="operations-row"><span>누적 주행거리</span><strong>{selected.distanceKm} km</strong></div><div className="operations-row"><span>예상 할인</span><strong>{selected.expectedDiscountPercent}%</strong></div></div><div className="operations-card"><div className="operations-card-head">검증 출처</div><div className="operations-row"><span>ZK 증명</span><strong>연결 전</strong></div><div className="operations-row"><span>온체인 거래</span><strong>없음</strong></div></div><p className="operations-note">보험 계약 반영과 증명 검증 상태는 아직 확인할 수 없습니다.</p>{decisionError ? <p className="operations-note danger-text" role="alert">처리 결과를 저장하지 못했습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.</p> : null}</div><div className="operations-panel-foot"><span>{selected.reviewStatus === "PENDING" ? "앱에서 처리 상태를 조회할 수 있습니다." : "처리 완료"}</span>{selected.reviewStatus === "PENDING" ? <div className="action-buttons"><button className="button secondary" disabled={busy} type="button" onClick={() => { void decide("REJECTED"); }}>미적용 결정</button><button className="button primary" disabled={busy} type="button" onClick={() => { void decide("APPLIED"); }}>할인 적용 결정</button></div> : null}</div></> : <div className="empty-state">선택할 신청이 없습니다.</div>}</section></div>
  </>;
}

export function LinkedVerificationHistory() {
  const { items, error, loading, refresh } = useApplications();
  return <><div className="workflow-banner"><div><strong>앱 신청의 검증 상태</strong><p>증명·체인 검증 정보는 연결 전입니다. 검증 결과가 확인되면 상태를 표시합니다.</p></div><button type="button" onClick={() => { void refresh(); }}>새로고침 →</button></div>{error ? <p className="operations-note operations-top-note" role="alert">검증 이력을 불러오지 못했습니다.</p> : null}<section className="panel operations-connections" aria-label="연동 검증 이력"><div className="panel-heading"><div><h2>검증 이력</h2><span>{loading ? "불러오는 중" : `${items.length}건`}</span></div></div>{items.length === 0 ? <div className="empty-state">앱에서 제출된 신청이 없습니다.</div> : items.map((item) => <div className="operations-connection" key={item.id}><strong>{item.id.slice(0, 8)}</strong><small>{item.riderName} · {reviewLabel(item.reviewStatus)}</small><span className="status-badge">ZK 미연결</span></div>)}</section></>;
}
