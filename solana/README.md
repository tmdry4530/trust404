# Trust404 · Solana 결제 거절 검증

자율 구매 에이전트가 지출을 요청하면 게이트웨이가 지급 정책을 평가한다. 검증자는 서명된 결제 요청과 판단 영수증, 별도로 확보한 신뢰 프로필을 사용해 네트워크 연결 없이 거절 사유를 다시 계산한다. 요청을 먼저 앵커링하고 판단을 이후 슬롯에 앵커링한다.

## 데모

`demo-offline.html`을 내려받아 Ed25519 Web Crypto와 import map을 지원하는 최신 브라우저에서 연다. 저장소 루트에서 `npm run demo:solana`를 실행하고 `http://127.0.0.1:4041`을 열어도 된다. 파일 안에 코드, 예제 영수증, 신뢰 프로필이 들어 있다. 외부 리소스 및 RPC 호출이 없다. 브라우저가 로컬 파일 실행을 제한하면 이 디렉터리에서 `python3 -m http.server 8080 --bind 127.0.0.1`을 실행하고 `http://127.0.0.1:8080/demo/`를 연다.

| 시나리오 | 입력 | 기대 결과 |
| --- | --- | --- |
| 한도 초과 | 예제 USDC 185, 허용 한도 100 | 서명, 배치 포함, 정책 판정 모두 통과 |
| 미등록 가맹점 | 예제 USDC 42, 허용 목록에 없는 수취 계정 | 수취 계정에 대한 거절 재현 |
| 서명된 오판 | 예제 USDC 64, 허용 한도 100, 허용된 수취 계정 | 서명과 두 포함 증명 통과, ‘결제 허용’으로 재평가해 실패 |
| 금액 변조 | 서명된 185를 파일에서 85로 변경 | 요청 서명 실패, 후속 단계 미실행 |

**로컬넷 실측 영수증**은 Agave 2.2.14에서 요청을 슬롯 80, 판단을 슬롯 124에 기록하고 두 계정을 `finalized`로 조회한 사례다. 요청은 185 TEST, 허용 한도는 100 TEST다. [영수증](./examples/localnet/receipt.json) · [감사 프로필](./examples/localnet/trusted-profile.json) · [요청 조회 기록](./examples/localnet/request-observation.json) · [판단 조회 기록](./examples/localnet/decision-observation.json)

브라우저에서 영수증 JSON을 열거나 내려받아 금액을 편집한 뒤 다시 가져올 수 있다. 기본 프로필의 키, 민트, 슬롯과 루트는 합성 예제다. 네트워크에서 실제로 확인한 영수증은 감사자가 독립적으로 준비한 프로필과 함께 검증한다.

## 두 컨트랙트에 대한 포팅 판단

기준 소스는 [RecordAnchor.sol](https://github.com/tmdry4530/trust404/blob/0e90d757237d51e54bb49015498c73e7bc0cca9b/contracts/RecordAnchor.sol), [CreditState.sol](https://github.com/tmdry4530/trust404/blob/0e90d757237d51e54bb49015498c73e7bc0cca9b/contracts/CreditState.sol), [verifyOne와 auditAll](https://github.com/tmdry4530/trust404/blob/0e90d757237d51e54bb49015498c73e7bc0cca9b/src/verifier/verify.js)이다.

| 원본 기능 | 솔라나 구현과 보장 범위 |
| --- | --- |
| 단일 발행자, 순차 배치, 기록 재사용 금지 | 프로그램 ID와 발행자로 레지스트리 PDA를 고정한다. 배치 PDA는 발행자와 순번으로 결정한다. 서명, 다음 순번, 비영(非零) 루트와 1~32개 리프를 검사하고 프로그램에 수정·삭제 명령을 두지 않았다. 여러 발행자가 같은 프로그램에서 각자 독립된 레지스트리를 사용할 수 있다. |
| 블록 번호·시각 | 배치에 Solana Clock의 슬롯과 Unix 시각을 저장한다. 검증기는 요청보다 큰 판단 배치 ID 및 슬롯을 요구한다. 슬롯은 EVM 블록 번호와 호환되지 않는다. |
| 요청·판단 서명 및 이중 머클 포함 증명 | Ed25519, SHA-256 리프·노드 접두어, 비대칭 크기 트리 분할을 유지한다. 결제용 v1 서명 도메인, 민트, 수취 계정, 정수 금액, 정책 해시, 요청 배치 참조를 바인딩한다. 기존 EVM 영수증은 원래 검증기로 처리한다. |
| CreditState의 담보·부채와 LTV 재실행 | 단건 결제 한도와 수취 계정 허용 목록으로 정책을 교체했다. 이 두 규칙은 서명된 입력과 사전 고정 정책으로 재현된다. 대출 장부, 잔액 조회, 동적 일일 한도에 대한 증명은 구현 범위 밖이다. |
| 원본의 RPC 기반 제3자 검증 | 연결 상태에서 감사자가 `finalized` 배치 계정을 조회해 체크포인트를 보관한다. 오프라인 검증 결과는 그 체크포인트의 출처와 무결성에 의존한다. RPC 응답 JSON 자체에는 검증 가능한 합의 서명이 없다. |
| 전체 기록 감사와 90초 SLA | 이번 포트의 검증 단위는 영수증 한 건이다. 등록 전 누락, 배치 전체의 완전성, 결정 지연을 이 화면에서 판정할 수 없다. |

**앵커링 채택 기준.** 결제 시점과 독립적으로 발행자의 사후 기록 변경을 대조해야 하면, 서로 다른 시점의 요청·판단 배치와 미리 확보한 체크포인트가 필요하다. 같은 서명자와 정책으로 거절 이유만 재계산하는 작업은 로컬에서 가능하다. 프로그램의 장기 불변성은 배포 바이트코드와 업그레이드 권한 관리에도 의존한다. [Solana PDA](https://solana.com/docs/core/pda) · [프로그램 업그레이드](https://solana.com/docs/core/programs/program-deployment)

## 정책과 증거

- `request.agentKey`가 요청을 서명한다. 수취 주소는 `recipient`, 토큰은 `mint`로 식별한다. 표시명은 서명된 설명이다.
- 정책 평가 순서는 수취 계정 허용 여부, 1회 한도 초과 여부다. 둘 다 위반하면 `MERCHANT_NOT_ALLOWED`가 우선한다. 금액은 최소 단위의 u64 십진 문자열이며 한도와 같으면 허용한다.
- 발행자의 판단 서명은 정책 해시, 요청 리프 해시, 요청 배치 ID·슬롯·루트·리프 인덱스와 거절 코드를 묶는다. 시각 `issuedAt`은 발행자가 기록한 값이다.
- 신뢰 프로필에는 genesis hash, 프로그램 ID, 발행자/에이전트 공개키, 정책 해시와 배치 체크포인트가 들어간다. 영수증 파일은 자신의 신뢰 프로필을 설정할 수 없다. 감사자가 프로필을 보관하거나 인증된 경로로 전달해야 한다.
- 증거가 보여주는 것은 해당 요청에 특정 정책을 적용한 결과다. 실제 정산, 미송금, 지급 승인 권한 및 네트워크 장애 여부는 별도 관찰 대상이다.

## 실행과 검증

Node.js 22.22.2 이상. 오프라인 검증기에는 외부 npm 패키지가 필요하지 않다.

```sh
node tools/verify.mjs --demo
node --test test/*.test.mjs
node tools/verify.mjs examples/localnet/receipt.json examples/localnet/trusted-profile.json
```

단일 HTML 재빌드는 `python3 demo/tools/build_offline.py demo-offline.html`이다. 합성 근거와 공개 프로필을 새 키로 재생성하려면 먼저 `node tools/make-demo.mjs`를 실행한다. 생성기는 개인키를 디스크에 기록하지 않는다.

### 로컬 검증자에서 두 배치 발행

Agave CLI와 cargo-build-sbf가 설치된 환경에서 이 디렉터리 기준으로 실행한다. 실제 토큰 전송은 발생하지 않는다.

```sh
npm ci --prefix chain
(cd chain && cargo build-sbf --tools-version v1.58 --arch v0)
solana-test-validator --ledger ./localnet-ledger \
  --bpf-program "$(solana-keygen pubkey chain/target/deploy/trust404_anchor-keypair.json)" \
  chain/target/deploy/trust404_anchor.so
```

검증자가 준비되면 다른 터미널에서 실행한다.

```sh
node tools/localnet.mjs "$(solana-keygen pubkey chain/target/deploy/trust404_anchor-keypair.json)"
```

이 스크립트는 localhost에서 새 테스트 계정에 SOL을 에어드롭하고, 레지스트리 생성 → 요청 서명 → 요청 배치 확정 → 정책 판단 및 서명 → 판단 배치 확정 → 계정 재조회 → 오프라인 검증을 수행한다. 결과 폴더의 `receipt.json`과 `trusted-profile.json`을 브라우저나 CLI에서 재검증할 수 있다. 스크립트가 생성한 키는 종료 시 제거한다.

운영자와 감사자를 분리할 때는 감사자 측에서 정한 RPC, 프로그램 ID와 발행자로 두 배치를 직접 조회한다. `case.mjs profile`은 로컬 I/O 명령이며 입력 JSON의 RPC 기원을 인증하지 않는다.

```sh
node chain/cli.mjs read --rpc "$AUDITOR_RPC" --program "$PROGRAM_ID" --publisher "$PUBLISHER" --batch-id "$REQUEST_BATCH" > request-observation.json
node chain/cli.mjs read --rpc "$AUDITOR_RPC" --program "$PROGRAM_ID" --publisher "$PUBLISHER" --batch-id "$DECISION_BATCH" > decision-observation.json
node tools/case.mjs profile config.json request-observation.json decision-observation.json > trusted-profile.json
node tools/verify.mjs receipt.json trusted-profile.json
```

`config.json`은 감사자가 고정한 `{context,issuer,agentKeys,policy}` 구조다. `tools/localnet.mjs`에 생성 예시가 있다. `chain/`은 배치 범위 1~32를 지원하고 `tools/case.mjs`는 개별 요청·판단을 각각 단일 리프 배치로 발행한다. 기본 UI 예제는 배치마다 3개의 리프를 포함한다.

## 검증 기록

- 원본 머클 구현 및 새 구현으로 동일한 3리프 요청·판단 배치의 루트를 계산해 두 값이 각각 일치하는지 확인했다.
- Rust 단위 테스트 3개와 Solana 클라이언트 테스트 2개를 통과했다. 컴파일한 SBF를 LiteSVM에 로드해 트랜잭션 12건을 실행했고, 정상 4건과 거절 8건이 예상대로 처리됐다.
- 로컬 Agave 검증자에서 실제로 서명한 트랜잭션을 제출하고 두 체크포인트를 확보했다. `examples/localnet/`에는 공개 영수증과 관측값만 들어 있다.
- Chromium을 오프라인 모드로 실행해 합성 사례 4개와 로컬넷 실측 사례 1개, JSON 저장·가져오기, 외부 프로필 적용과 변조 감지를 확인했다. HTTP 요청은 0건이었다. 화면 폭 320~1440px를 확인했다. Playwright가 설치된 환경에서 `python3 demo/tools/check_offline.py demo-offline.html`로 브라우저 검사를 재현할 수 있다.
