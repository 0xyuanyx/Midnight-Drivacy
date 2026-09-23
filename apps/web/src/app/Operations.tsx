import { useMemo, useState } from "react";
import type { WorkspaceState } from "../domain/workspace";
import { readPolicyDocument } from "./readPolicyDocument";
import { linkedDemoEnabled } from "./LinkedEvaluations";
import { Search, Upload, PlugZap } from "lucide-react";

type RiderTab = "conditions" | "conversion" | "versions";
type ConversionStage = "upload" | "edit" | "draft" | "manual";

const riderTabs: Array<[RiderTab, string]> = [["conditions", "현재 조건"], ["conversion", "규칙 변경"], ["versions", "변경 이력"]];

function Row({ label, value }: { label: string; value: string }) {
  return <div className="operations-row"><span>{label}</span><strong>{value}</strong></div>;
}

export function Riders() {
  const [tab, setTab] = useState<RiderTab>("conditions");
  const [stage, setStage] = useState<ConversionStage>("upload");
  const [documentName, setDocumentName] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [isReading, setIsReading] = useState(false);

  async function uploadDocument(file?: File) {
    if (!file) return;
    setDocumentError("");
    setIsReading(true);
    try {
      const text = await readPolicyDocument(file);
      setDocumentName(file.name);
      setPolicyText(text);
      setStage("edit");
      if (!text.trim()) setDocumentError("문서에서 글자를 읽지 못했습니다. 스캔 문서라면 아래에 약관 내용을 직접 입력해 주세요.");
    } catch (error) {
      setDocumentError(error instanceof Error && /^(PDF|10MB)/.test(error.message) ? error.message : "문서를 읽지 못했습니다. 파일을 확인한 뒤 다시 올려 주세요.");
    } finally {
      setIsReading(false);
    }
  }
  return <>
    <section className="summary-grid" aria-label="특약 요약">
      <article className="summary-card"><span>운영 특약</span><strong>1</strong><small>연결 전</small></article>
      <article className="summary-card"><span>현재 규칙</span><strong>v1.4</strong><small>연결 전</small></article>
      <article className="summary-card"><span>변환 초안</span><strong>—</strong><small>생성된 초안 없음</small></article>
      <article className="summary-card"><span>실제 적용 상태</span><strong>—</strong><small>연결 전</small></article>
    </section>
    <div className="workflow-banner"><div><strong>규칙·조건 관리</strong><p>가입자의 특약 승인 요청은 대시보드에서 처리합니다.</p></div></div>
    <div className="workspace-grid">
      <section className="panel" aria-label="특약 목록"><div className="panel-heading"><div><h2>특약 목록</h2><span>1건</span></div></div><div className="operations-list-head"><span>특약 / 상품</span><span>상태</span></div><div className="operations-list-row selected"><span><strong>안전운전 할인특약</strong><small>개인용 자동차보험</small></span><span>선택됨</span></div></section>
      <section className="panel detail-panel operations-detail" aria-label="특약 상세">
        <div className="detail-heading"><div><span className="detail-eyebrow">특약 상세</span><h2>안전운전 할인특약</h2><p>현재 조건과 규칙 변경을 확인합니다.</p></div><span className="status-badge">규칙 확인 전</span></div>
        <div className="detail-tabs" role="tablist" aria-label="특약 상세 탭">{riderTabs.map(([id, label], index) => <button key={id} id={`rider-${id}`} aria-controls="rider-panel" tabIndex={tab === id ? 0 : -1} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % riderTabs.length : event.key === "ArrowLeft" ? (index + riderTabs.length - 1) % riderTabs.length : event.key === "Home" ? 0 : event.key === "End" ? riderTabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); setTab(riderTabs[next][0]); document.getElementById(`rider-${riderTabs[next][0]}`)?.focus(); } }}>{label}</button>)}</div>
        <div className="detail-content" role="tabpanel" id="rider-panel" aria-labelledby={`rider-${tab}`}>
          {tab === "conditions" ? <div className="operations-stack"><div className="operations-card"><div className="operations-card-head">적용 조건</div><Row label="누적 주행거리" value="500 km 이상" /><Row label="기본 할인" value="80점 이상 · 예상 10%" /><Row label="상위 할인" value="90점 이상 · 예상 12%" /></div><div className="operations-card"><div className="operations-card-head">규칙 상태</div><Row label="현재 버전" value="SAFE-DRIVE v1.4" /><Row label="실제 적용" value="연결 전" /></div><p className="operations-note">운영 규칙의 승인·등록 상태는 서비스 연결 후 확인할 수 있습니다.</p></div> : null}
          {tab === "conversion" ? <div className="operations-stack"><div className="operations-step-nav" role="group" aria-label="규칙 변경 단계"><button type="button" aria-pressed={stage === "upload"} onClick={() => setStage("upload")}>1. 문서 업로드</button><button type="button" aria-pressed={stage === "edit"} disabled={!documentName} onClick={() => setStage("edit")}>2. 내용 확인·수정</button><button type="button" aria-pressed={stage === "draft"} disabled={!policyText.trim()} onClick={() => setStage("draft")}>3. 규칙 초안</button><button type="button" aria-pressed={stage === "manual"} onClick={() => setStage("manual")}>수기 보완</button></div>
            {stage === "upload" ? <div className="operations-card"><div className="operations-card-head">특약 문서 업로드</div><div className="operations-card-body"><label className="operations-upload"><Upload size={20} aria-hidden="true" /><strong>변경할 특약 문서를 선택하세요</strong><span>PDF, DOCX, TXT, MD · 최대 10MB</span><input aria-label="특약 문서 업로드" type="file" accept=".pdf,.docx,.txt,.md" disabled={isReading} onChange={(event) => { void uploadDocument(event.target.files?.[0]); event.target.value = ""; }} /></label>{isReading ? <p className="operations-copy" role="status">문서 내용을 읽고 있습니다.</p> : null}{documentError ? <p className="operations-error" role="alert">{documentError}</p> : null}{documentName ? <p className="operations-copy">현재 문서: {documentName} · <button className="operations-link" type="button" onClick={() => setStage("edit")}>내용 확인·수정</button></p> : null}</div></div> : null}
            {stage === "edit" ? <div className="operations-card"><div className="operations-card-head">문서 내용 확인·수정</div><div className="operations-card-body"><div className="operations-document-head"><span>{documentName}</span><button className="operations-link" type="button" onClick={() => setStage("upload")}>다른 문서 올리기</button></div><textarea aria-label="추출된 약관 내용" value={policyText} onChange={(event) => { setPolicyText(event.target.value); setDocumentError(""); }} placeholder="문서에서 읽은 내용이 여기에 표시됩니다. 필요한 내용을 직접 수정할 수 있습니다." />{documentError ? <p className="operations-error" role="alert">{documentError}</p> : null}<div className="operations-actions"><span>수정한 내용으로 규칙 초안을 검토합니다.</span><button className="button primary" type="button" disabled={!policyText.trim()} onClick={() => setStage("draft")}>규칙 초안으로 이동</button></div></div></div> : null}
            {stage === "draft" ? <div className="operations-card"><div className="operations-card-head">규칙 초안</div><div className="operations-card-body"><p className="operations-note">자동 변환 서비스가 연결되면 수정한 문서 내용으로 규칙 초안을 생성할 수 있습니다. 생성된 초안은 담당자가 검토·승인하기 전까지 적용되지 않습니다.</p><div className="operations-actions"><span>원문: {documentName} · {policyText.trim().length.toLocaleString()}자</span><button className="button secondary" type="button" onClick={() => setStage("edit")}>문서 내용 다시 수정</button></div></div></div> : null}
            {stage === "manual" ? <div className="operations-card"><div className="operations-card-head">수기 보완 항목</div><Row label="필수 조건" value="거리·점수·할인율·감점 계수" /><Row label="다음 단계" value="약관 확인 후 직접 입력·검토" /></div> : null}
          </div> : null}
          {tab === "versions" ? <div className="operations-stack"><div className="operations-card"><div className="operations-card-head">규칙 버전</div><Row label="v1.4" value="조회 전" /><Row label="새 초안" value="없음" /></div><p className="operations-note">버전 등록·적용 이력은 아직 연결되지 않았습니다.</p></div> : null}
        </div>
        <div className="operations-panel-foot"><span>변환 결과의 저장·승인·적용 기능은 서비스 연결 후 제공됩니다.</span>{tab !== "conversion" ? <button className="button primary" type="button" onClick={() => setTab("conversion")}>규칙 변경</button> : <button className="button secondary" type="button" onClick={() => setTab("conditions")}>현재 조건 보기</button>}</div>
      </section>
    </div>
  </>;
}

export function VerificationHistory({ state, onOpenEvaluation }: { state: WorkspaceState; onOpenEvaluation: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => state.evaluations.filter((item) => `${item.id} ${item.displayId} ${item.applicantName}`.toLowerCase().includes(query.toLowerCase())), [state, query]);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  return <><p className="operations-note operations-top-note">검증 결과가 연결되면 증명 상태와 온체인 거래 정보를 확인할 수 있습니다.</p><div className="workspace-grid"><section className="panel" aria-label="검증 이력 목록"><div className="panel-heading"><div><h2>검증 이력</h2><span>{items.length}건</span></div></div><div className="list-tools"><label className="search-field"><Search size={14} aria-hidden="true" /><input aria-label="신청번호 검색" placeholder="신청번호 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="검증 상태 필터" disabled><option>검증 정보 없음</option></select></div><div className="operations-list-head"><span>신청번호 / 특약</span><span>검증</span></div>{items.length === 0 ? <div className="empty-state">검색 결과가 없습니다.</div> : items.map((item) => <button className={`operations-list-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><span><strong>{item.displayId}</strong><small>{item.riderName}</small></span><span>{"검증 정보 없음"}</span></button>)}</section>
    <section className="panel detail-panel operations-detail" aria-label="선택한 검증 이력">{selected ? <><div className="detail-heading"><div><span className="detail-eyebrow">검증 기록</span><h2>{selected.displayId}</h2><p>실제 체인 거래와 검증 영수증은 연결 전입니다.</p></div><span className="status-badge">체인 연결 전</span></div><div className="detail-content operations-stack"><div className="operations-card"><div className="operations-card-head">검증 출처</div><Row label="화면 데이터" value="브라우저 저장 기록" /><Row label="실제 ZK 검증" value="확인할 수 없음" /><Row label="온체인 거래" value="연결 전" /></div><p className="operations-note">점수·규칙·증명 상세와 처리 이력은 평가 요청 상세에서 확인합니다. 증명 검증 정보는 아직 연결되지 않았습니다.</p></div><div className="operations-panel-foot"><span>선택한 신청의 상세로 이동합니다.</span><button className="button secondary" type="button" onClick={() => onOpenEvaluation(selected.id)}>평가 요청 상세로 이동</button></div></> : <div className="empty-state">선택할 기록이 없습니다.</div>}</section></div></>;
}

export function Connections() {
  const rows = [["Backend API", "서버 응답과 업무 기능 연결", "확인 전"], ["가입자 앱 데이터", linkedDemoEnabled ? "로컬 브리지로 신청·처리 결과 공유" : "가입자 신청 전달", linkedDemoEnabled ? "로컬 연결 설정됨" : "미연동"], ["규칙 처리 서비스", "자동 변환·승인·등록 흐름", "확인 전"], ["보험사 업무 시스템", "할인 적용 결과 반영", "미연동"]];
  return <><div className="workflow-banner"><div><strong>서비스 연결 현황</strong><p>실제 서비스 상태 조회와 로컬 연결 설정을 구분해 표시합니다.</p></div><PlugZap size={18} aria-hidden="true" /></div><section className="panel operations-connections" aria-label="연동 상태"><div className="panel-heading"><div><h2>연동 상태</h2><span>읽기 전용</span></div></div>{rows.map(([name, description, status]) => <div className="operations-connection" key={name}><strong>{name}</strong><small>{description}</small><span className="status-badge">{status}</span></div>)}</section><p className="operations-note operations-top-note">서비스 연결 상태는 아직 조회되지 않습니다. 이 화면에서 변경할 설정은 없습니다.</p></>;
}
