# Midnight-Drivacy

Drivacy는 상세 주행기록을 보험사에 공개하지 않고, 보험사가 승인한 안전운전 할인 조건의 충족 여부를 Midnight의 영지식증명으로 검증하는 프로젝트입니다.

Privacy-preserving driving-based insurance eligibility proofs on Midnight.

현재 팀 합의, 발표용 데모 흐름, 구현 우선순위와 미해결 질문은 [PROJECT_DIRECTION.md](PROJECT_DIRECTION.md)를 참고하세요.

## Project status

Midnight Korea Hackathon 2026을 위한 초기 저장소입니다. 현재 실행 가능한 앱, Compact 계약, 증명 생성 및 네트워크 연동은 구현되지 않았습니다. 아래 내용은 구현 목표입니다.

## Planned demo

1. 보험사가 관리 화면에서 지원되는 특약 규칙의 값을 직접 입력하고 승인합니다.
2. 가입자가 해당 특약을 선택하고 두 번 이상의 모의 운행을 순서대로 처리합니다.
3. 승인 규칙에 따른 점수 계산과 이전·신규 누적 상태의 관계를 증명합니다.
4. 가입자가 보험사에 공개할 결과를 확인하고 제출을 승인합니다.
5. 보험사는 원본 위치·속도·운행시각·이동경로 없이 필요한 결과와 Midnight 검증 결과를 확인합니다.
6. 계산 결과, 규칙 또는 이전 상태를 부정하게 바꾼 요청이 거부되는 것을 확인합니다.

## Scope decision

- MVP의 규칙 등록은 **보험사 측 수기 입력**으로 진행합니다.
- 약관 문서 업로드, Document Agent 및 LLM 기반 규칙 변환은 MVP에서 제외합니다.
- 실제 GPS 수집, 외부 내비게이션 연동, 실제 보험사 시스템 연동은 MVP에서 제외합니다.
- 예시 보험사 한 곳, 특약 한 종 및 모의 주행기록을 대상으로 합니다.

## Verification boundaries

목표는 제출된 기록과 승인 규칙 사이의 계산 관계를 검증하는 것입니다. 입력 기록의 실제 운행 여부, 미제출 운행, 전체 운행의 완전성, 원본 삭제 사실 또는 보험사의 결과 재사용 방지까지 ZK가 보장하는 것은 아닙니다.

원본 기록은 설계상 Drivacy의 계산·증명 처리 영역에 일시적으로 존재합니다. 보험사와 공개 원장에 원본을 전달하지 않는 것이 목표이며, Drivacy 자체가 원본에 접근하지 않는 구조로 표현하지 않습니다.

## Run and submission

실행·컴파일·증명 생성 명령과 데모 절차는 구현 후 검증하여 추가할 예정입니다.

- [Hackathon program](https://www.hackathon.midnightkorea.org/kor)
- [Participant registration](https://luma.com/2pnv2fwk)
- [Midnight documentation](https://docs.midnight.network/)

공식 프로그램 페이지의 제출 마감: **2026-09-28 00:00 KST** (9월 27일 밤까지).
