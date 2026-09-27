# Midnight-Drivacy

Drivacy는 원본 주행기록을 계산·증명에 필요한 동안만 임시 처리하고, 보험사와 가입자가 승인된 특약 기준에 따른 운전습관 결과를 Midnight 기반 영지식증명(ZK) 흐름으로 검증할 수 있게 하는 프로젝트입니다.

## 1. 프로젝트 개요

### 프로젝트 소개

Drivacy는 가입자의 특약 선택부터 모의 주행, 누적 상태 계산, 할인 신청, 보험사 심사까지를 하나의 흐름으로 연결합니다. 가입자용 모바일 앱, 보험사용 웹, 업무 Backend, Rule Draft와 C/Wallet Runtime을 하나의 저장소에서 관리합니다.

### 프로젝트 목적

- 승인된 특약 Rule에 따라 안전운전 결과를 계산하고, 그 계산 관계를 검증 가능하게 제공
- 보험사와 가입자가 제3자의 결과값을 신뢰만 하지 않아도 되도록, 승인 Rule·상태 전이·평가 결과의 일치 여부를 ZK 검증으로 확인
- 원본 주행기록은 계산·증명에 필요한 동안만 임시 처리하고, 이후에는 보관하지 않는 것을 개인정보 보호 원칙으로 적용
- 이전 Confirmed State와 새 운행 결과를 연결해 누적 상태 관리
- 약관 문서 기반 Rule Draft와 보험사 검토·승인 흐름 지원
- `nullifier`와 업무 DB 제약으로 중복 평가 신청 방지

### 핵심 기능

| 구분 | 주요 기능 |
| --- | --- |
| 가입자 | 온보딩·동의, 예시 보험/특약 선택, 모의 주행, 누적 결과 확인, 데모 신청 |
| 보험사 | 특약 Rule 관리, 약관 Rule Draft 검토, 평가 요청·결과 확인, 데모 심사 |
| Backend | 인증·권한, Rule·Driving Session·Processing Job·State·최종 신청 상태 관리 |
| Midnight / ZK | 승인 Rule과 상태 전이의 검증, 지갑 승인 및 체인 확인 처리 경계 |

## 2. 전체 서비스 구성

| 구분 | 구성 서비스 | 주요 책임 | 대표 위치 |
| --- | --- | --- | --- |
| 가입자 서비스 | Driver Mobile | 가입·동의, 보험·특약 선택, 주행·신청 UX | `apps/mobile` |
| 보험사 서비스 | Insurer Web | Rule·평가 요청·심사 업무 UI | `apps/web` |
| 업무 Backend | Drivacy API | 인증, 객체 권한, 업무 데이터, 상태 전이, C/Wallet 호출 경계 | `apps/backend` |
| 공통 모듈 | Shared / Rule Draft | 공통 타입·계약, Rule 형식 검증, 약관 Draft 생성 보조 | `packages/shared`, `packages/rule-draft` |
| ZK / Wallet | C/Wallet Runtime | Proof·지갑 승인·체인 확인 처리 | `packages/midnight/runtime` |
| 데이터 계층 | Supabase / PostgreSQL | 인증 및 오프체인 업무 데이터·migration 관리 | `db`, Supabase |

## 3. 프로젝트 디렉터리 구조

```text
Midnight-Drivacy/
├── apps/
│   ├── backend/              업무 Backend API
│   ├── mobile/               가입자용 Expo 앱
│   └── web/                  보험사용 React/Vite 웹
├── packages/
│   ├── shared/               공통 타입·Zod 계약
│   ├── rule-draft/           약관 기반 Rule Draft 모듈
│   └── midnight/             Compact·ZK·C/Wallet runtime 관련 코드
├── contracts/                Midnight/Compact 계약 관련 파일
├── db/                       DB schema 및 migration
├── config/                   로컬 실행 설정
├── docs/                     설계·연동·검증 문서
├── scripts/                  데모 및 검증 보조 스크립트
├── PROJECT_DIRECTION.md      프로젝트 결정 및 구현 방향
└── package.json              workspace 실행 명령
```

## 4. 서비스별 책임 분리

| 서비스 | 책임 | 주의 사항 |
| --- | --- | --- |
| `apps/mobile` | 가입자 화면과 동의·주행·신청 UX | 기본 실행은 명시적인 로컬 데모이며 실제 가입자 인증·지갑 생성이 아님 |
| `apps/web` | 보험사 Rule·평가·심사 화면 | 기본 실행은 fixture 기반이며 실제 보험사 시스템에 연결하지 않음 |
| `apps/backend` | 인증·권한, 업무 상태, C/Wallet adapter 호출 | 가입자 Wallet private key·seed·witness를 보관하지 않음 |
| `packages/rule-draft` | 약관 문서에서 지원 형식의 Rule 초안 생성 보조 | 생성 결과는 자동 승인·자동 적용되지 않음 |
| `packages/midnight` | Compact, Proof, Wallet, 체인 확인 처리 | Backend 업무 DB나 보험사 심사를 대체하지 않음 |

## 5. 전체 통신 구조

```text
Driver Mobile ───────┐
                     ▼
              Drivacy Backend ──── Supabase / PostgreSQL
                     │
                     ▼
              C/Wallet Runtime
                     │
                     ▼
              Midnight / ZK
                     ▲
                     │
Insurer Web ─────────┘
```

Backend는 업무 데이터와 권한을 관리하고, Proof·지갑 승인·체인 확인은 C/Wallet Runtime에 위임합니다. C/Wallet의 `chain-confirmed` 결과가 검증되기 전에는 새 상태를 Confirmed State로 확정하지 않습니다.

## 6. 핵심 처리 흐름

### Rule 등록 및 승인

```text
특약 정보 / 약관 문서
→ 구조화된 Rule 또는 Rule Draft
→ 보험사 검토·수정
→ 승인 Rule 및 버전 관리
→ Rule Hash / Midnight 등록 처리
```

LLM·문서 변환 결과는 초안이며, 보험사가 검토·승인한 Rule만 계산과 증명 기준으로 사용합니다.

### 주행 및 상태 전이

```text
직전 Confirmed State
→ Driving Session
→ 모의 주행 데이터 및 승인 Rule 계산
→ Candidate State
→ C/Wallet Proof·체인 처리
→ chain-confirmed
→ Backend Confirmed State
```

`calculated`, `proving`, `submitted`, `chain-unknown`, `db-pending`은 Confirmed State가 아닙니다. 다음 운행과 최종 신청은 직전 Confirmed State만 기준으로 삼습니다.

### 최종 할인 신청 및 보험사 심사

```text
최신 Confirmed State
→ Discount Application
→ Final Evaluation / ZK 검증
→ VERIFIED 또는 FAILED
→ 보험사 심사
→ APPLIED 또는 REJECTED
```

검증 결과와 보험사의 할인 업무 결정은 별도로 관리합니다. 동일 보험사·특약·평가 범위의 중복 신청은 DB 제약과 `nullifier`로 방지합니다.

## 7. 개인정보 보호 및 ZK 검증 범위

### 원본 주행기록 처리 원칙

보험사가 원본을 받지 않는 것만이 Drivacy의 핵심 차별점은 아닙니다. 보험사와 가입자는 승인된 Rule, 상태 전이 및 평가 결과의 검증 과정을 확인할 수 있고, 어느 한쪽 또는 별도 제3자가 결과를 맞게 계산했다고 신뢰만 할 필요가 없습니다.

위치·경로·정확한 시각·구간별 속도 등 원본 주행기록은 점수 계산과 증명에 필요한 동안에만 임시 처리하며, 그 밖의 저장소에 장기 보관하지 않는 것을 서비스 원칙으로 합니다. 보험사에는 필요한 집계 결과와 검증 결과만 전달합니다.

### 보험사에 제공하지 않는 정보

- GPS 위치와 이동경로
- 정확한 운행 시각, 구간별 속도, 원본 Driving Record
- salt, owner secret, witness, Wallet private key

### 보험사가 확인하는 정보

- 적용 특약과 Rule Version / Rule Hash
- 승인된 범위의 점수·누적 거리 등 집계 결과
- 조건 충족 여부, 할인 구간, Verification Result

영지식증명은 **회로에 입력된 제출 기록에 승인된 Rule이 적용되고, 이전 State에서 신규 State로의 전이 조건이 성립하는지**를 검증합니다. 기록이 실제 운행에서 생성됐는지, 모든 실제 운행이 제출됐는지, 원본이 실제로 폐기됐는지까지는 증명하지 않습니다. 따라서 원본 폐기 정책의 실제 집행과 감사는 Backend 운영 범위로 별도 관리합니다.

## 8. 기술 스택

| 영역 | 주요 기술 | 사용 위치 |
| --- | --- | --- |
| 가입자 앱 | Expo 57, React 19, React Native 0.86, Expo Router | `apps/mobile` |
| 보험사 웹 | React 19, Vite 7, TypeScript | `apps/web` |
| Backend | Node.js 24, TypeScript, Express 5 | `apps/backend` |
| 인증 / DB | Privy, Supabase, PostgreSQL | Mobile, Backend, DB |
| Rule Draft | PDF.js, Zod | `packages/rule-draft` |
| 검증 / 체인 | Midnight, Compact, DApp Connector API | `packages/midnight` |
| 품질 관리 | Vitest, Jest, ESLint, TypeScript | 전체 workspace |

## 9. 데모 실행

### 사전 요구사항

- Node.js 24 LTS
- npm

### 설치

```bash
git clone https://github.com/0xyuanyx/Midnight-Drivacy.git
cd Midnight-Drivacy
npm ci
```

### 가입자 앱 데모

```bash
npm run dev:driver-preview
```

환경변수를 설정하지 않은 새 클론은 `preview` 모드로 시작하며, 이 실행에는 API key나 Privy 설정이 필요하지 않습니다. 소스를 수정했다면 명령을 다시 실행해야 합니다.

### 보험사 웹 데모

```bash
npm run dev:insurer
```

기본 실행은 브라우저 `localStorage` 기반 fixture 모드입니다.

### 가입자·보험사 연결 데모

```bash
npm run dev:linked
```

이 명령은 가입자 웹 미리보기, 보험사 웹, 공유 메모리 데모 서버를 함께 실행합니다.

가입자 화면에서 예시 보험을 선택하고 두 번의 모의 주행을 완료한 뒤 **데모 신청**을 진행하면, 보험사 웹의 **평가 요청** 목록에 신청이 표시됩니다. 보험사 웹에서 **데모 할인 적용** 또는 **데모 미적용**을 선택한 뒤 가입자 화면에서 상태를 새로고침할 수 있습니다.

> 이 연결 데모는 사전에 정해진 모의 점수·거리와 메모리 데이터를 사용합니다. OTP `123456`, 예시 보험, 신청·심사 결과는 실제 Privy 인증·보험계약·보험사 제출·ZK Proof·Midnight 거래가 아닙니다. 데모 서버를 재시작하면 신청 데이터가 사라집니다.

### 실제 인증·Backend 확인 모드

실제 Privy 인증 흐름은 기본 데모와 분리되어 있습니다. `apps/mobile/.env.example`을 `apps/mobile/.env`로 복사한 뒤, 같은 Privy 앱의 공개 App ID·모바일 Client ID·접근 가능한 Backend 주소를 설정하고 `EXPO_PUBLIC_AUTH_MODE=privy`로 명시적으로 전환해야 합니다.

```bash
npm run dev:auth-only
```

`dev:auth-only`는 C/Wallet 없이 인증·동의·본인 보험계약/특약 조회를 확인하는 Backend 실행 모드입니다. `DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`이 필요하며, 전체 C/Wallet·Midnight 처리 경로는 실행하지 않습니다.

## 10. 빌드 및 테스트

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

가입자 앱만 별도로 확인하려면 다음 명령을 사용합니다.

```bash
npm run mobile:typecheck
npm run mobile:test
npm run mobile:export
```
##  11. 구현 상태와 제한사항

### 구현 및 로컬 실제 연동 검증 완료

- 가입자용 Expo 앱과 보험사용 React/Vite 웹
- 가입자·보험사 간 로컬 메모리 연결 데모
- Privy 이메일 OTP 인증
- Backend 토큰 검증 및 가입 정보 DB 저장
- 인증된 가입자 기준 보험계약·특약 조회
- Rule Draft, Driving Session, Processing Job, Confirmed State, 최종 신청 관련 코드
- Midnight/Compact 계약 소스와 빌드·테스트 구성
- C/Wallet Runtime의 HTTP 처리 경계와 주행 처리·최종 평가 요청 계약
- C/Wallet 처리 결과가 `chain-confirmed`일 때만 Confirmed State로 승격하도록 연결한 Backend 상태 관리

### 데모 또는 외부 환경에서 미검증인 범위

- 실제 가입자 Wallet 생성·연결 및 사용자 거래 승인
- C/Wallet Runtime과 가입자 Wallet을 연결한 실제 증명 처리
- Lace / Midnight Preprod 거래 제출·체인 확정
- 실제 보험사 업무 시스템 연동 및 할인 계약 반영
- production 수준의 C/Wallet durable recovery

## 12. 문서

| 문서 | 설명 |
| --- | --- |
| [프로젝트 방향](./PROJECT_DIRECTION.md) | 확정·제안·미결정 사항과 개발 방향 |
| [`docs/`](./docs) | API, 상태 전이, C/Wallet, 최종 평가, 검증 문서 |
| [`db/`](./db) | Supabase/PostgreSQL migration 및 데이터 모델 |

## 13. MVP 범위

```text
보험사 Rule 등록·승인
→ 가입자 특약 선택
→ 2회 이상 모의 주행
→ 이전 상태와 연결된 누적 계산
→ ZK / Midnight 검증 흐름
→ 중복 방지된 할인 신청
→ 보험사 할인 판단 및 결과 확인
```

실제 GPS 백그라운드 수집, 외부 주행데이터 연동, 실제 보험사 시스템 연동, 다수 보험사·특약 지원, 모든 약관 산식의 자동 변환은 MVP 범위에서 제외합니다.

---

Midnight Korea Hackathon 2026 프로젝트입니다.
