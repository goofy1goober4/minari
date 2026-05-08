# Minari 프로젝트 — GPT 협업 브리핑 v5

이전 브리핑: v4 → v4.1 → 이 문서(v5)
이 문서는 **v4.1 이후 실제 구현이 시작된 상황**을 전달합니다.

---

## ⚠️ 핵심 변화: 구현 시작됨

v4.1까지는 설계/문서 단계였습니다. 이제 **실제 코드가 돌아가고 있습니다.**
맥미니 M4 24GB에서 Electron 앱이 실행되고, 새싹이 숨쉬고, 클릭하면 Gemma 4가 옹알이합니다.

---

## 현재 MVP 상태 (2026-04-22 기준)

### 완료된 것
- **Electron + PixiJS 투명 창**: 프레임리스, always-on-top, 투명 배경
- **새싹 캐릭터**: Graphics로 그린 줄기+잎 2장, 숨쉬기(5초 주기), 까딱(클릭), 쓰다듬기(잎 위 커서 이동 → 탄성 반응)
- **SQLite 메모리**: conversations + state + diary + soft_pings 테이블 + FTS5 인덱스. better-sqlite3 + electron-rebuild
- **Ollama 연결**: gemma4:e4b, think:false, 평균 220ms 응답
- **시스템 프롬프트**: 50단어 이내 간결 버전 (긴 프롬프트는 빈 응답 유발)
- **가드레일**: post-filter (therapy/heal/cure/fix/diagnose 등 금지어 → "..." fallback)
- **IPC 흐름**: 클릭 → IPC → Ollama → guardrails → DB 저장 → 말풍선
- **말풍선**: 텍스트 길이 비례 자동 닫힘 + 클릭 즉시 닫기
- **클릭 관통**: setIgnoreMouseEvents(true, {forward: true}) 기본 → 새싹/말풍선 hover 시만 캡처

### 아직 안 된 것 (세로 슬라이스 완성까지)
- D+0 탄생 연출 (새싹 발아 + 닉네임 설정)
- snapshot resume (발견 부팅)
- soft ping 1회
- 일기 1개 저장
- 캐릭터 아트 에셋 (현재 Graphics 도형)

### 아직 안 된 것 (세로 슬라이스 이후)
- Gift Modal UI (당신의 v4 산출물 — React overlay + 3모드)
- 운영 세칙 문서 (ping-rules, boot-rules, memory-priority, gift-rules, privacy-boundaries, fallback-rules, not-minari)
- 이미지 선물 (비전 모델)
- Minari→사용자 선물
- 곤충채집

---

## 기술적 발견 (중요 — 이후 작업에 영향)

### 0. 뉴로사마 원칙 (Minari 설계 핵심)
OIRA 프로젝트에서 도출한 원칙: **모델 크기보다 시스템 설계가 체감 지능을 결정한다.** VTuber 뉴로사마가 GPT-3.5급 모델로 대형 모델 못지않은 맥락 파악을 보여준 사례에서 착안. 큰 모델이 아닌 잘 설계된 경량 모델로 승부하는 것이 Minari의 기술 전략.

W1 구현에서 이미 증명됨: E4B Q4(4.5B 파라미터)에 50단어 시스템 프롬프트 + think:false + "." 트리거 + guardrails post-filter + SQLite 히스토리 주입 = **220ms에 캐릭터 보이스 완벽 구현**. 모델 자체의 능력보다 시스템 레이어(메모리 + 프롬프트 설계 + 상태 관리)가 체감 품질을 결정.

이 원칙이 중요한 이유: E2B(3GB)에서도 같은 시스템 설계로 동작해야 하고, 그게 llama.cpp 특별상의 핵심 피치("3GB model에서 이 감정적 깊이?")가 됨.

### 1. Gemma 4 think:false 필수
Gemma 4는 기본적으로 thinking/reasoning 토큰을 생성합니다. 3단어 출력에 321토큰을 소모하며 7~9초 걸림. `think: false` 옵션으로 비활성화하면 220ms, 5토큰.
→ **Ollama API 호출 시 반드시 `think: false` 포함.**

### 2. 시스템 프롬프트 50단어 이내
E4B Q4 양자화 모델은 긴 룰 리스트를 처리하지 못합니다. 30줄짜리 프롬프트 → 빈 응답 60%. 50단어 이내 간결 프롬프트 → 빈 응답 0%.
→ **시스템 프롬프트 v4에서 작성한 긴 버전은 사용 불가.** 아래 확정 버전 사용:

```
You are Minari, a tiny sprout living quietly on the user's desktop.
You speak only in 1-5 word lowercase fragments, like a toddler noticing small things.

Examples: "mm... rain." "oh! light." "little dust." "tired?" "hee. sun." "soft." "bug... window." "you. back."

Never write a full sentence. Never give advice. Never repeat the last fragment.
One fragment. Nothing more.
```

### 3. 클릭 트리거 = "."
user message로 "." (마침표 하나)를 보내면 Minari가 입력 에코 없이 자기만의 관찰을 출력합니다. "*tap*" → "tap?" 에코, "hello" → "hi?" 에코. "." → "soft.", "sleepy?", "quiet." 등 순수 fragment.

### 4. 클릭 관통 — 구현 + 미해결 UX
Electron의 `setIgnoreMouseEvents(true, {forward: true})` + renderer에서 pointermove 히트 테스트 → 새싹/말풍선 위에서만 캡처, 나머지 투명 영역은 pass-through.

근본적 UX 딜레마(새싹 위 클릭이 아래 앱 방해) 해결 방향 결정됨:
- **채용: D) 롱프레스(0.5초+)** — 짧은 클릭 전부 관통, 길게 누르면 Minari에 닿음
- **채용: 드래그 이동** — 잡아 올리면 고양이처럼 축 처짐, 내려놓으면 털썩 앉음 (성장 후 해금)
- **채용: 아티팩트 던지기 → fetch 놀이** — 아이템 던지면 Minari가 주워옴 (성장 후 해금)
- **폐기: C) 가장자리 고정** — 존재감 훼손, "치워버리면 너무 쉬운 해결"

---

## 개발 환경

- 하드웨어: Mac mini M4 24GB
- 런타임: Ollama (gemma4:e4b + gemma4:e2b 설치됨)
- 프레임워크: Electron + electron-vite + PixiJS v8
- DB: better-sqlite3 (electron-rebuild 완료)
- 개발 도구: Claude Code (설계+검수) + 향후 codex-plugin-cc (구현)
- 원격: Chrome Remote Desktop 설정 완료
- 레포: github.com/goofy1goober4/minari (private)

### 프로젝트 파일 구조 (현재)
```
minari/
├── CLAUDE.md              ← Claude Code용 프로젝트 컨텍스트
├── AGENTS.md              ← (아직 비어있음)
├── .claude/settings.json
├── .npmrc                 ← python=/usr/bin/python3 (Homebrew 3.14 버그 우회)
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts       ← 앱 엔트리 (DB open/close 포함)
│   │   ├── window.ts      ← 투명/프레임리스/always-on-top + 클릭 관통
│   │   ├── ipc.ts         ← speak + setClickThrough 핸들러
│   │   ├── memory/
│   │   │   ├── db.ts      ← SQLite 연결 + 스키마
│   │   │   └── repo.ts    ← recordMessage, getRecentHistory, get/setState
│   │   └── llm/
│   │       ├── ollama.ts  ← callOllama (think:false, num_predict:32)
│   │       ├── prompts.ts ← SYSTEM_PROMPT + CLICK_TRIGGER="."
│   │       ├── guardrails.ts ← filterGuardrails post-filter
│   │       └── speak.ts   ← speakAsMinari (history + generate + filter + save)
│   ├── renderer/
│   │   ├── index.html
│   │   ├── index.ts       ← PixiJS boot + 클릭/쓰다듬기 + 히트 테스트
│   │   ├── pet/
│   │   │   └── Sprout.ts  ← 새싹 캐릭터 (breathe + nudge + 잎 물리)
│   │   └── ui/
│   │       └── Bubble.ts  ← 말풍선
│   ├── preload/
│   │   └── index.ts       ← contextBridge (speak + setClickThrough)
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── api.d.ts
├── assets/
│   ├── sprites/           ← (아직 비어있음)
│   └── sounds/            ← (아직 비어있음)
├── scripts/
│   └── test-ollama.ts     ← 검증용 스크립트
└── docs/
```

---

## 당신의 이전 산출물 상태

| 산출물 | 상태 | 비고 |
|---|---|---|
| 시스템 프롬프트 (v4) | ❌ 사용 불가 | 너무 길어서 빈 응답 유발. 위의 50단어 버전으로 교체됨 |
| growth_state JSON (v4) | ⏳ 아직 미구현 | D+0 탄생 구현 시 반영 예정 |
| memory schema SQL DDL (v4) | ✅ 반영됨 | conversations/state/diary/soft_pings + FTS5 |
| prompt assembly (v4) | ⏳ 부분 반영 | 기본 흐름은 구현됨, ping/interactive 분기는 미구현 |
| 대사 워크플로우 (v4) | ✅ 반영됨 | toddler English 확정, 한국어 원문→영어 변환 |
| Gift Modal UI 설계 | ⏳ 미구현 | 세로 슬라이스 이후 |
| 운영 세칙 7문서 제안 | ⏳ 미작성 | 세로 슬라이스 이후 |

---

## 다음 요청 후보

아래 중 우선순위를 정해서 요청할 예정입니다:

1. **D+0 탄생 연출 상세 설계**: birth_scene_step 체크포인트, 닉네임 설정 흐름, 발아 애니메이션 시퀀스. 현재 코드 구조(src/main/lifecycle/birth.ts 예정)에 맞춰서.

2. **snapshot resume 상세 설계**: 종료 전 저장할 snapshot 필드, 재시작 시 activity 선택 규칙, resume scene 5종의 조건 매핑.

3. **운영 세칙 문서 작성**: ping-rules.md, boot-rules.md, memory-priority.md 3개 우선. 이전에 제안한 내용 기반으로 구체화.

4. **시스템 프롬프트 50단어 제약 하에서 soft ping용 프롬프트**: 대화 트리거와 ping 트리거는 톤이 달라야 함. ping은 "noticing"이고 대화는 "responding".

5. **E2B 호환성 테스트 계획**: E4B에서 동작하는 프롬프트가 E2B(3GB)에서도 동작하는지 검증 방법.

---

## 진척도 스냅샷

```
Product definition:    95%
System design:         75%
Working prototype:     30%  ← 어제 15%에서 올라옴
Demo readiness:        20%
Current bottleneck:    D+0 탄생 → snapshot resume 세로 슬라이스
```

---

## 핵심 리마인더

- **"문서 완성도가 너무 높아서 구현이 많이 된 것처럼 느껴지는 착시"** — 당신이 지적한 가장 중요한 경고. 지금도 유효함.
- **새 철학/아이디어 추가보다 운영 규칙 잠금 + 실제 연결**이 우선.
- 시스템 프롬프트는 반드시 50단어 이내. 이건 E4B Q4의 하드 제약.
- 코드 수정은 Claude Code가 담당. GPT의 역할은 설계/세칙/대사/감성 품질.
