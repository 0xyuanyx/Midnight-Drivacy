# Midnight 오픈소스 재사용 후보

조사일: 2026-09-16 (KST) · 상태: GitHub 조사·추천, 설치·도입·빌드 전

## 추천 조합

**Claude Code + Midnight Expert**로 개발 지원을 받고, **create-mn-app**의 계약·로컬 네트워크 실행 구성을 참고하며, **공식 Wallet SDK**로 가입자 임베디드 월렛을 구현하는 조합을 추천한다. React와 계약 연동은 **example-bboard**를 참고한다. 최종 패키지·버전 채택은 구현 시 검증 후 정한다.

사용자가 말한 ‘엘리펀트’와 일치하는 Midnight 개발 도구는 이번 검색에서 확인하지 못했다. 기존 프로젝트 문서에 있는 Claude 개발 도구는 **Midnight Expert**이며, 동일 도구를 뜻한 것으로 추정한다.

## GitHub 후보와 Drivacy에서의 용도

| 후보 | 제공하는 것 | Drivacy에 추천하는 용도 | 라이선스 |
| --- | --- | --- | --- |
| [midnight-expert](https://github.com/midnightntwrk/midnight-expert) | Claude Code용 Compact·SDK·개발환경·검증 플러그인 | 계약 작성, SDK 연결, 환경 점검과 검증 지원 | MIT |
| [create-mn-app](https://github.com/midnightntwrk/create-mn-app) | DApp 생성 CLI, hello-world 계약, 로컬 devnet·proof server 실행 구성 | 첫 계약의 컴파일·배포·호출 및 클론 실행 준비 구조 | Apache-2.0 |
| [example-bboard](https://github.com/midnightntwrk/example-bboard) | Compact 계약, 공통 API, CLI, React UI | 계약/API/UI 분리와 실제 증명·트랜잭션 연결 패턴 | Apache-2.0 |
| [midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) | Wallet SDK, 키·주소·트랜잭션·상태 동기화, 브라우저 테스트 앱 | 가입자 측 자체 보관형 임베디드 월렛 | Apache-2.0 |
| [midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) | Docker 로컬 네트워크, 테스트 계정 자금·DUST 준비 | 앱과 별도로 로컬 인프라를 관리할 때의 대안 | Apache-2.0 |
| [OpenZeppelin compact-contracts](https://github.com/OpenZeppelin/compact-contracts) | Compact 계약 모듈, 접근 제어 등의 재사용 패턴 | 규칙 관리 권한 등에 필요한 모듈만 선택 검토 | MIT |

위 설명·라이선스는 각 GitHub 저장소 README와 GitHub API에서 확인했다. 후보를 Drivacy에 설치·복사하거나 프로젝트 호환성을 시험하지는 않았다.

## 후보별 적용 메모

### Midnight Expert와 Claude

README는 Windows에서 **WSL2 내부에 Claude Code·Node.js·Compact·플러그인을 설치**하도록 안내한다. native PowerShell은 지원 대상이 아니다. Windows 개발에서는 이 경로를 추천한다.

확인한 Claude CLI 설치 안내는 다음과 같다. 아래는 참고 명령이며 이번 작업에서 실행하지 않았다.

```bash
claude plugin marketplace add https://midnightntwrk.expert
claude plugin install --scope user midnight-expert@midnight-expert
```

필요에 따라 `compact-core`, `compact-examples`, `midnight-tooling`, `midnight-wallet`, `midnight-verify` 플러그인을 선택한다. Frontend 지원은 디자인 완료 후 검토한다. 개발 지원 도구를 사용했다는 사실과 실제 계약·증명 검증 성공은 구분한다.

### create-mn-app과 로컬 실행

README의 hello-world는 Docker 로컬 devnet과 proof server, 컴파일·배포 흐름을 제공한다. 외부 월렛 확장이나 faucet 없이 시작하는 구성이다. CLI 자체는 Windows도 지원하지만 Compact 컴파일은 WSL이 필요하다고 구분한다. 기존 Drivacy 레포를 다른 새 프로젝트로 대체하지 않고 필요한 구조를 검토해 적용한다.

### 공식 React 예제와 Wallet SDK

example-bboard의 계약·API·CLI·React 구조를 참고한다. 해당 UI는 Lace 확장 연결 예제이므로 Drivacy의 임베디드 월렛이 구현됐다는 근거로 삼지 않는다. 게시판의 업무 로직이나 화면을 Drivacy 사양으로 가져오지 않는다.

임베디드 월렛은 midnight-wallet의 SDK·docs snippets·브라우저 테스트 앱을 참고한다. SDK가 키와 트랜잭션 기능을 제공해도 Drivacy의 키 보관·승인 UI·인증 연결은 별도 구현해야 한다. 가입자 키를 서버에 보관하지 않는 확정 방향을 유지한다.

### OpenZeppelin Compact 모듈

접근 제어 등 필요한 모듈만 검토한다. README는 실험 단계이며 저장소의 TypeScript witness는 테스트 전용이라고 명시한다. 테스트 witness를 그대로 서비스 구현으로 가져오지 않는다. 운행 계산·상태 전이·Dataset 연결 회로는 Drivacy 사양에 맞춰 작성·검증해야 한다.

## 조사 시점의 저장소 커밋

GitHub API로 확인한 각 기본 `main` HEAD다. 재조사 위치를 남기기 위한 기록이며, README를 열람한 시점의 내용과 커밋별 소스 전체를 대조한 것은 아니다. 아래 서로 다른 저장소 커밋들이 하나의 호환 가능한 버전 조합이라는 뜻도 아니다.

| 저장소 | 확인한 HEAD |
| --- | --- |
| midnightntwrk/midnight-expert | `3748566fc7877654bb99e7d31420bd218743d163` |
| midnightntwrk/create-mn-app | `bdc86733d2a9d2e381cb050aec4fdde7b33559b4` |
| midnightntwrk/example-bboard | `38bfac8c574abb0c5a96c9e076779716c3e88231` |
| midnightntwrk/midnight-wallet | `59b530def24a49c9bc870a86234869d1df6d94bb` |
| midnightntwrk/midnight-local-dev | `902561ddc27a4b096f19835ab1528f38ace515f1` |
| OpenZeppelin/compact-contracts | `e22b73ceeba7e210503e9916188cdedf97ec7a96` |

도입할 때 하나의 네트워크·컴파일러·Runtime·SDK 조합을 선택하고 버전·lockfile을 고정한 뒤 새 클론에서 확인한다. 코드 재사용 시 원본 라이선스·저작권 고지와 적용 범위를 남긴다.

## ZK 관련 추가 재사용 후보

사용자의 후속 요청으로 ZK 회로·Merkle·nullifier 관련 소스도 조사했다. 우선순위는 **Compact 표준 라이브러리 → Merkle·nullifier 예제 → 비공개 조건 평가 예제**다. 아래 링크는 참고·재사용 후보이며 Drivacy에 코드를 복사하거나 설치한 상태는 아니다.

| 후보 | Drivacy에서 사용할 부분 | 라이선스 |
| --- | --- | --- |
| [Compact 표준 라이브러리 소스](https://github.com/LFDT-Minokawa/compact/blob/main/compiler/standard-library.compact) | `MerkleTreePath`, `merkleTreePathRoot`와 해시·커밋먼트 연산을 이용한 Dataset 입력 연결 | Apache-2.0 |
| [Compact Merkle 테스트 예제](https://github.com/LFDT-Minokawa/compact/blob/main/examples/adt/tests/merkletree_field.compact) | 삽입·경로 Root 계산·`checkRoot` 정상/변경 Root 검증 패턴 | Apache-2.0 |
| [NullifierDoubleSpend 예제](https://github.com/midnightntwrk/midnight-expert/blob/main/plugins/compact-core/skills/compact-privacy-disclosure/examples/NullifierDoubleSpend.compact) | commitment와 nullifier의 용도 분리, 경로 leaf 연결, 사용 여부 검사·등록 패턴 | MIT |
| [example-zkloan](https://github.com/midnightntwrk/example-zkloan) | 비공개 값의 조건 평가, 제한된 결과 공개, witness·회로·시뮬레이터 테스트 분리 | Apache-2.0 |
| [midnight-zk](https://github.com/midnightntwrk/midnight-zk) | Midnight의 증명 시스템·회로 도구 원리와 구현 참고 | Apache-2.0 |

### 적용 범위

- Compact 표준 라이브러리는 선택한 Compact toolchain과 함께 사용한다. 별도 Merkle 패키지의 해시·직렬화 규칙을 임의로 섞지 않고 Backend의 경로 생성과 회로의 Root 계산을 일치시킨다.
- Dataset leaf에 묶인 기록을 실제 계산 입력과 연결한다. Root 확인만으로 점수 계산이나 누적 상태 전이가 검증됐다고 표시하지 않는다.
- nullifier 예제는 단일 사용 토큰 데모다. Drivacy에서는 같은 평가 결과에 재시도마다 동일한 nullifier가 대응하도록 사양을 정한다. 예제의 토큰·익명성·과거 Root 허용 정책을 그대로 채택하지 않는다.
- ZKLoan은 조건 평가·공개 결과·테스트 구조를 참고하는 예제다. 대출·신용평가·attestation 서버·PIN 기능은 Drivacy에 추가하지 않는다.
- `midnight-zk`는 Rust 기반 하위 증명 시스템이다. 앱에서는 Compact와 SDK 경로를 우선 사용하고, 증명 엔진을 직접 수정하는 작업은 현재 범위에 넣지 않는다.
- 시뮬레이터 테스트와 실제 증명 생성·체인 검증은 구분한다. 승인 규칙·이전 상태·계산 입력을 바꾼 요청이 실제 검증 경로에서도 거부되는지 확인한다.

소스 확인 위치: [Compact 저장소](https://github.com/LFDT-Minokawa/compact), [ZKLoan 계약](https://github.com/midnightntwrk/example-zkloan/blob/main/contract/src/zkloan-credit-scorer.compact), [ZKLoan 테스트](https://github.com/midnightntwrk/example-zkloan/blob/main/contract/src/test/zkloan-credit-scorer.test.ts). Compact 표준 라이브러리·Merkle 테스트와 ZKLoan 계약은 아래 조사 커밋의 raw source도 확인했다. nullifier 예제는 조사 당시 `main` 소스를 확인했다. 이번 작업에서 컴파일·증명 생성은 하지 않았다.

## ZK 외에 재사용할 후보

추가 기능을 만들기보다 이미 합의한 약관 입력·초안 검증·수기 수정·테스트를 지원하는 라이브러리만 추천한다.

| 후보 | 재사용 목적 | 적용 시점 | 라이선스 |
| --- | --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 텍스트 PDF 약관 읽기·추출, 원문과 초안 비교를 위한 미리보기 | PDF 파일을 지원할 때 | Apache-2.0 |
| [Zod](https://github.com/colinhacks/zod) | 승인 전 LLM 초안·수기 규칙·API 입력의 자료형과 허용 범위 검증 | Rule·API 스키마 확정 후 | MIT |
| [React Hook Form](https://github.com/react-hook-form/react-hook-form) | 보험사 규칙 수정·수기 입력 폼과 입력 오류 표시 | 디자인 완성 후 Frontend 구현 | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | 규칙 검증·누적 계산·실패·중복 처리 테스트 | 런타임·프로젝트 설정 선정 후 | MIT |

PDF.js의 [Node 텍스트 추출 예제](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)도 확인했다. PDF 지원 여부·파일 규격은 아직 확정하지 않았으며 이미지 스캔 PDF용 OCR을 추가 사양으로 채택하지 않는다. Zod의 스키마 검증은 약관 해석이나 ZK 계산 검증을 대신하지 않는다. 모의 LLM 테스트를 실제 공급자 호출 성공으로 표현하지 않는다.

로그인·DB·Backend 프레임워크는 기존의 미정 기술 스택 선정과 함께 결정한다. 이번 조사에서 특정 인증·DB 서비스를 추가로 확정하지 않았다.

## 추가 조사 커밋

다음은 GitHub API로 확인한 조사 시점의 기본 브랜치 HEAD다. 설치할 패키지 버전이나 서로 호환 가능한 조합으로 확정한 값은 아니다.

| 저장소 | 기본 브랜치 | 확인한 HEAD |
| --- | --- | --- |
| LFDT-Minokawa/compact | `main` | `c47230cc8c3e743634166d9b84698ac2b238c418` |
| midnightntwrk/midnight-zk | `main` | `695351f1cdb3909affd1c89fef0a5eb3e9fa3ab7` |
| midnightntwrk/example-zkloan | `main` | `eff9030d509f98938914c1b2b721acb88fc1e42c` |
| mozilla/pdf.js | `master` | `58550d5b43b01e35154fc4aa15de5ff62602b4f3` |
| colinhacks/zod | `main` | `59bbc03e10c636b9eb3c393dfeb552819774ec21` |
| react-hook-form/react-hook-form | `master` | `d9b4b1a2f084baf2ff2688fbec7231fcb1db4d60` |
| vitest-dev/vitest | `main` | `0780a8e5b7967a4168173599e9c74fb79aab2483` |
