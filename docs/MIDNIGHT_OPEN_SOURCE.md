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
