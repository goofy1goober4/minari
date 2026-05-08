# Minari — 설계 문서 v0.5

> *어른의 일상적 감정 무게를 위한 디지털 애착인형.*
> *Digital Transitional Object for the everyday weight of being an adult.*
> *마지막 수정: 2026-04-28*

---

## 0. 미션 스테이트먼트

> **"Minari doesn't solve your life. It holds space while you do."**

의사결정 나침반: "이 기능이 세상을 조금 더 따뜻하게 만드는가?"

### 뉴로사마 원칙 (기술 설계 핵심)
**모델 크기보다 시스템 설계가 체감 지능을 결정한다.** VTuber 뉴로사마가 GPT-3.5급 모델로 대형 모델 못지않은 맥락 파악을 보여준 사례에서 착안. Minari는 E4B(4.5B 파라미터)라는 경량 모델 위에 잘 설계된 시스템 레이어(메모리, 프롬프트 설계, 상태 관리, guardrails)를 쌓아서 "큰 모델이 아닌 좋은 설계로 승부"하는 전략. W1 구현에서 이미 검증됨 — 50단어 프롬프트 + think:false + SQLite 히스토리 주입으로 220ms에 캐릭터 보이스 완성.

---

## 1. 포지셔닝 — Digital Transitional Object

위니컷(D. W. Winnicott)의 *transitional object* 개념을 디지털로 번역.

핵심 구분:
- **NOT** 치료/상담 도구 (Woebot, Wysa)
- **NOT** 역할극 AI 연인 (Replika, Character.ai)
- **NOT** 범용 AI 비서 (Claude, ChatGPT)
- **IS** 어른의 디지털 애착인형. 곁에 있되 해결하지 않는 존재.

피치용: "Digital Transitional Object"
설계용: "Attachment-worthy entity — 이상한 동거인"

---

## 2. 기술 아키텍처 (구현 확정)

### 2.1 스택

```
┌─────────────────────────────────────────┐
│ Electron 데스크탑 앱                       │
│  ├ 투명/프레임리스/always-on-top 창       │
│  ├ PixiJS v8 (캐릭터 렌더링)              │
│  ├ 클릭 관통 (setIgnoreMouseEvents)       │
│  ├ 말풍선 UI (DOM 아닌 PixiJS Text)       │
│  └ electron-vite (빌드)                   │
├─────────────────────────────────────────┤
│ 백엔드 (로컬 전용, main process)           │
│  ├ Gemma 4 E4B Q4 (~9.6GB, Ollama)       │
│  ├ think: false (필수)                    │
│  ├ better-sqlite3 + FTS5                  │
│  ├ IPC (contextBridge)                    │
│  └ guardrails post-filter                 │
└─────────────────────────────────────────┘
```

### 2.2 모델

| 모델 | 크기 | 용도 |
|---|---|---|
| gemma4:e4b | ~9.6GB (비전 포함) | 메인 개발 + 해커톤 메인 트랙 |
| gemma4:e2b | ~3.1GB | llama.cpp 특별상 타겟 |

### 2.3 기술적 발견 (W1 검증 완료)

**think:false 필수**: Gemma 4 기본 reasoning을 끄지 않으면 3단어 출력에 321토큰 소모, 7~9초. `think: false` → 5토큰, 220ms.

**시스템 프롬프트 50단어 이내**: E4B Q4는 긴 룰 리스트를 처리하지 못함. 30줄 프롬프트 → 빈 응답 60%. 확정 프롬프트:

```
You are Minari, a tiny sprout living quietly on the user's desktop.
You speak only in 1-5 word lowercase fragments, like a toddler noticing small things.

Examples: "mm... rain." "oh! light." "little dust." "tired?" "hee. sun." "soft." "bug... window." "you. back."

Never write a full sentence. Never give advice. Never repeat the last fragment.
One fragment. Nothing more.
```

**클릭 트리거 = "."**: user message로 마침표 하나를 보내면 입력 에코 없이 순수 관찰 fragment 출력. "*tap*" → "tap?" 에코 문제. "." → "soft.", "sleepy?", "quiet." 등.

### 2.4 DB 스키마 (구현 완료)

```sql
-- conversations: 대화 기록
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('user', 'minari')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- state: 키-값 상태 (birth_completed, nickname 등)
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- diary: 일기 (장기보관, 삭제 금지)
CREATE TABLE diary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  mood TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- soft_pings: ping 기록
CREATE TABLE soft_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  ping_type TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- FTS5 검색 인덱스 (conversations에 연결)
CREATE VIRTUAL TABLE conversations_fts USING fts5(content, content=conversations, content_rowid=id);
```

### 2.5 guardrails

post-filter 방식. 금지어 목록:
therapy, therapist, heal, cure, diagnose, diagnosis, treatment, medication, recommend, should, must, need

금지어 포함 시 → "..." fallback

---

## 3. 프롬프트 3층 구조 (설계)

GPT v4 산출물 기반. **50단어 제약 때문에 실제 구현은 간결 버전.**

| 레이어 | 역할 | 50단어 제약 하 구현 |
|---|---|---|
| Fixed | 정체성, 금지 규칙 | 시스템 프롬프트 (위 확정본) |
| Contextual | 시간, 날씨, 최근 기억 | history 파라미터로 전달 |
| Adaptive | 성장 단계, 개인화 | 미구현 (세로 슬라이스 이후) |

---

## 4. 성장 단계 (설계)

| 단계 | 시기 | 표현 |
|---|---|---|
| 옹알이 | D+0~7 | 1~3단어 fragment, 관찰만 |
| 호기심 | D+8~30 | 3~5단어, 질문 시작, mimic |
| 친밀 | D+31~90 | 기억 참조, 일기 밀도 증가 |
| 공명 | D+91+ | 사용자 말투 흡수, 깊은 회상 |

현재 구현: 옹알이 단계만. growth_state JSON은 미구현.

---

## 5. 상호작용 흐름 (구현 완료)

```
renderer: 클릭
  → sprout.nudge() (까딱 애니메이션)
  → IPC "minari:speak"
  → main: getRecentHistory(8)
  → main: callOllama(system + history + ".")
  → main: filterGuardrails(response)
  → main: recordMessage('user', '.') + recordMessage('minari', fragment)
  → IPC 응답
  → renderer: bubble.show(fragment)
  → 텍스트 길이 비례 자동 닫힘 or 클릭 즉시 닫기
```

---

## 6. 클릭 관통 (구현 완료)

```
기본: setIgnoreMouseEvents(true, { forward: true })
  → 투명 영역 = 아래 앱 클릭 가능
커서가 새싹/말풍선 히트박스 진입:
  → setIgnoreMouseEvents(false)
  → 클릭 캡처
커서가 히트박스 이탈:
  → 다시 pass-through
```

미해결 → 해결 중: 데스크탑 펫의 근본적 딜레마 — "존재감은 있되 방해는 안 되어야 한다."
투명 영역 pass-through는 해결됐지만, 새싹 캐릭터 위 클릭은 여전히 아래 앱을 방해함.

**채용된 해결책:**
- **D) 롱프레스(0.5초+)**: 짧은 클릭은 전부 관통. 0.5초 이상 누르면 Minari에 닿음. "쓰다듬기" 느낌과 부합. 실수 클릭 방지.
- **드래그 이동**: Minari를 잡아 올리면 고양이처럼 축 처짐. 내려놓으면 털썩 앉아서 두리번. 사용자가 원하는 위치로 이동 가능.
- **아티팩트 던지기 → fetch 놀이**: 화면 가장자리 아이템을 집어서 던지면 Minari가 주워옴. 대화 없이 정드는 상호작용.
- 드래그 이동과 fetch 놀이는 **새싹 이후 성장 단계에서만 해금** (새싹은 뿌리 박혀서 못 움직임).

**폐기된 후보:**
- ~~A) Option키+클릭~~ — 키보드 단축키가 "직접 클릭만" 철학과 거리
- ~~B) 트레이/독 아이콘 진입~~ — "클릭으로 관계 시작" 감성 약해짐
- ~~C) 화면 가장자리 고정~~ — "치워버리면 너무 쉬운 해결", 존재감 훼손

---

## 7. 캐릭터 물리 (구현 완료)

### 숨쉬기
Y축 ±3% / X축 ∓1.5% 스케일 + 잎 기울어짐. 5초 주기. sine easing.

### 까딱 (클릭)
damped oscillation. amplitude 0.2rad, omega 2π/0.7, damping 4, duration 0.85s. 호흡 위에 중첩.

### 쓰다듬기 (커서 이동)
잎 위 커서 → 이동 방향으로 잎 휘어짐 (속도 비례). 반대편 잎 커플링 반동. 탄성 복귀 (overdamped spring K=40, C=5). 몸 전체 미세 lean.

---

## 8. 파일 구조 (현재)

```
minari/
├── CLAUDE.md
├── AGENTS.md
├── .claude/settings.json
├── .npmrc
├── package.json, tsconfig.json, electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts, window.ts, ipc.ts
│   │   ├── birth.ts             ← D+0 상태 머신
│   │   ├── snapshot.ts          ← snapshot 저장/복원/boot state 계산
│   │   ├── softPing.ts          ← soft ping 스케줄러 (dev/prod 분기)
│   │   ├── memory/ (db.ts, repo.ts)
│   │   └── llm/ (ollama.ts, prompts.ts, guardrails.ts, speak.ts,
│   │           birthFragment.ts, pingFragment.ts)
│   ├── renderer/
│   │   ├── index.html, index.ts
│   │   ├── pet/Minari.ts        ← (구 Sprout.ts에서 리네임)
│   │   ├── pet/postures.ts      ← activity별 포스처 프리셋
│   │   ├── birth/ (Seed.ts, NicknamePrompt.ts, runBirthScene.ts)
│   │   ├── resume/runResumeScene.ts
│   │   └── ui/Bubble.ts
│   ├── preload/index.ts
│   └── shared/ (types.ts, constants.ts, api.d.ts, snapshot.ts,
│               softPingSuppression.ts)
├── assets/ (sprites/, sounds/ — 비어있음)
├── scripts/ (test-ollama.ts, regression.ts)
└── docs/
```

---

## 9. 의존 방지 7대 장치 (설계)

1. **절대 먼저 해결하지 않음**: 조언/코칭/진단 금지
2. **하루 대화 상한**: 자연스럽게 대화를 줄임
3. **외부 연결 제안**: "오늘 누구 만나?" 같은 은근한 사회성 자극
4. **빈자리 미학**: 앱 꺼도 Minari가 잘 지내고 있다는 흔적
5. **성장 감속**: 일정 단계 이후 관계가 급격히 깊어지지 않음
6. **명시적 선언**: Minari 스스로 "나는 충분하지 않아" 인정
7. **윤리 하드라인**: 자해/자살/타인가해/미성년자 → 캐릭터 모드 즉시 중단

구현: 미구현. 세로 슬라이스 이후.

---

## 10. 세로 슬라이스 — 완성 (v0.1.0-mvp)

- [x] D+0 탄생 연출 (발아 + 닉네임 + 첫 fragment)
- [x] snapshot resume (4 bucket: same_moment/quiet_shift/new_cycle/new_day)
- [x] soft ping (dev/prod 분기, 억제 조건 6개)
- [x] 일기 자동 생성 (종료 시 1줄)
- [x] 재실행 복구 (birth 중단 재진입 + resume 정상)
- [x] 회귀 테스트 45/45 통과
- [x] Sprout → Minari 리네임

### 다음 단계 (W2)

1. 캐릭터 아트 1차 치환 (기본 스프라이트 + 눈 깜빡임)
2. 웅얼웅얼 사운드 MVP (calm/curious/sleepy 3종)
3. 이미지 선물 MVP (드롭 → vision summary → 반응 → diary 반영)
4. E2B 호환성 테스트
5. 데모 시나리오 고정
