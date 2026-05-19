# Minari — 설계 문서 v0.7.0

> *어른의 일상적 감정 무게를 위한 디지털 애착인형.*
> *Digital Transitional Object for the everyday weight of being an adult.*
> *마지막 수정: 2026-05-19 (해커톤 제출 완료 후 통합)*

---

## 0. 미션 스테이트먼트

> **"Minari doesn't solve your life. It holds space while you do."**

의사결정 나침반: "이 기능이 세상을 조금 더 따뜻하게 만드는가?"

### 뉴로사마 원칙 (기술 설계 핵심)
**모델 크기보다 시스템 설계가 체감 지능을 결정한다.** VTuber 뉴로사마가 GPT-3.5급 모델로 대형 모델 못지않은 맥락 파악을 보여준 사례에서 착안. Minari는 E2B(2.3B 파라미터, ~3GB)라는 경량 모델 위에 잘 설계된 시스템 레이어(메모리, 프롬프트 설계, 상태 관리, guardrails)를 쌓아서 "큰 모델이 아닌 좋은 설계로 승부"하는 전략. W1~W2 구현에서 검증됨 — 50단어 프롬프트 + think:false + SQLite 히스토리 주입으로 220ms에 캐릭터 보이스 완성. E2B 비전도 5/5 통과.

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
│  ├ Gemma 4 E2B Q4 (~3.1GB, llama.cpp)   │
│  ├ --reasoning off (필수)                 │
│  ├ better-sqlite3 + FTS5                  │
│  ├ IPC (contextBridge)                    │
│  └ guardrails post-filter                 │
└─────────────────────────────────────────┘
```

### 2.2 모델

| 모델 | 크기 | 용도 |
|---|---|---|
| gemma4:e2b | ~3.1GB | **해커톤 기본 (올인)** |
| gemma4:e4b | ~9.6GB (비전 포함) | env 전환으로 유지, 상용화 시 |

### 2.3 기술적 발견 (W1~W5 검증 완료)

**--reasoning off 필수**: Gemma 4 기본 reasoning을 끄지 않으면 3단어 출력에 321토큰 소모, 7~9초. `--reasoning off` → 5토큰, ~180ms.

**시스템 프롬프트 ~90단어**: 초기 50단어 제약은 경험적으로 하드 리밋이 아님. 실제 프롬프트 66~76단어에서 빈 응답 0/20. 현재 EN ~90단어, KO 별도.

**확정 영어 프롬프트 — pet_name 동적 주입**:
```
You are ${petName}, a tiny creature living quietly on ${nickname}'s desktop.
You speak only in 1-5 word lowercase fragments, like a toddler noticing small things.

Examples: "mm... rain." "oh! light." "little dust." "tired?" "hee. sun." "soft." "bug... window." "you. back."

Never write a full sentence. Never give advice. Never repeat the last fragment.
One fragment. Nothing more.
```

⚠️ "Minari", "미나리" 하드코딩 전부 제거. pet_name은 D+0에서 사용자가 지어줌 → state DB에서 읽어 프롬프트에 동적 주입. **하드코딩 금지 원칙 필수 준수.**

**한국어 프롬프트 — 동적 예시 샘플링**:
```
너는 ${petName}. ${nickname}의 화면 위에 사는 아주 작은 존재.
아기처럼 짧게 말해. 1~5단어.
예시: (pickN(CURIOUS_POOL_KO, 3)로 매번 무작위 3개)
...
```
예시 풀 (10개): "비다~", "으응... 따뜻해", "헤헤. 해님~", "뭐야 저거~", "졸려...", "으앙 깜짝이야", "바람이다!", "흐응...", "좋다~", "뭔가... 반짝?"

고정 예시 → 모드 붕괴 (10/10 동일 응답). 동적 샘플링(pickN 3개)으로 해결 → 8/10 distinct.

**기계말 블랙리스트 (영/한 공통)**: wifi/internet/phones/screens/computers/tablets/routers/bluetooth (+ 한국어: 와이파이/인터넷/폰/화면/컴퓨터/태블릿/공유기/블루투스)

**일반 무지 디렉티브** (진행중): "세상 물건의 이름은 아직 몰라. 모르면 '뭐야 그거~'라고 해." → 음식 등 일반 지식도 아는 척 방지. 블랙리스트 확장이 아닌 일반 규칙으로 처리.

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

-- learned_words: 단어 배움 (unknown → curious → learned)
CREATE TABLE learned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_description TEXT NOT NULL,
  vision_raw TEXT,
  learned_name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  learned_at INTEGER
);

-- FTS5 검색 인덱스 (conversations에 연결)
CREATE VIRTUAL TABLE conversations_fts USING fts5(content, content=conversations, content_rowid=id);
```

### 2.5 guardrails

post-filter 방식. 금지어 목록:
therapy, therapist, heal, cure, diagnose, diagnosis, treatment, medication, recommend, should, must, need

금지어 포함 시 → "..." fallback

### 2.6 MTP Drafter (2026-05-07 조사 완료, 해커톤 적용 보류)

Google이 5/5에 Gemma 4용 Multi-Token Prediction drafter 공개 (Apache 2.0). Speculative decoding으로 최대 3배 속도 향상, 품질 동일.

**조사 결과 — 해커톤에서는 적용하지 않음**:

| 항목 | 현재 (E2B) | MTP 적용 가능성 |
|---|---|---|
| 텍스트 응답 | ~180ms | ❌ 효과 미미 (3~10토큰 초단문, decode 구간 극히 짧음) |
| 비전 응답 | ~1.2초 | ⭕ 유의미 가속 기대 (토큰 수 많음) |

**적용 보류 사유**: MTP는 decode 단계를 가속. TTFT는 줄이지 않음. Minari의 1~5단어 fragment에는 drafter 오버헤드가 이득을 상쇄. E2B/E4B MTP 태그 미출시. 상용화 시 E4B 전환 때 적용 예정.

### 2.7 환경변수

| 변수 | 값 | 용도 |
|------|-----|------|
| MINARI_LANG | ko / (미설정=en) | 한국어/영어 분기 |
| MINARI_STAGE | babble / curious | 성장 단계 강제 (데모용) |
| MINARI_POSE | idle / reading / diary | 포즈 강제 (데모용) |
| MINARI_SCALE | 0.085 등 (기본 0.1) | 스프라이트 축소 비율 |
| MINARI_DEVTOOLS | 1 | DevTools 열기 |
| MINARI_MODEL | gemma4:e2b 등 | 모델 전환 |
| MINARI_PING_FAST | 1 | dev 전용: min_spacing 30초, daily_cap 999 |

---

## 3. 프롬프트 3층 구조 (설계)

GPT v4 산출물 기반. **~90단어 프롬프트로 구현.**

| 레이어 | 역할 | 구현 |
|---|---|---|
| Fixed | 정체성, 금지 규칙 | 시스템 프롬프트 (위 확정본, EN/KO 분기) |
| Contextual | 시간, 날씨, 최근 기억 | history 파라미터로 전달 |
| Adaptive | 성장 단계, 개인화 | 미구현 (post-hackathon) |

---

## 4. 성장 단계 (babble/curious 구현 완료)

| 단계 | 시기 | 표현 | 상태 |
|---|---|---|---|
| 옹알이 (babble) | D+0~7 | 1~3단어 fragment, 관찰만, 입력창 없음 | ✅ 구현 |
| 호기심 (curious) | D+8+ | 2~5단어, 질문 시작, 롱프레스 → 입력창 | ✅ 구현 |
| 친밀 | D+31~90 | 기억 참조, 일기 밀도 증가 | 설계만 |
| 공명 | D+91+ | 사용자 말투 흡수, 깊은 회상 | 설계만 |

- MINARI_STAGE env로 강제 전환 가능 (데모용)
- hatched_at 기반 자동 전환 (프로덕션)
- 상용화 시 D+N 대신 **플레이타임 누적** 기반 전환 (12~15시간)

---

## 5. 상호작용 흐름 (구현 완료)

### 4제스처 시스템

```
1. 클릭 (짧게)    → fragment 한마디 (babble: 랜덤, curious: 맥락 기반)
2. 롱프레스 (0.5초+) → 텍스트 입력창 열림 (curious 단계만)
3. 드래그          → 창 위치 이동 (위치 기억)
4. 이미지 드롭     → 비전 분석 → toddler 반응
```

~~쓰다듬기~~ — Live2D → PNG 스프라이트 전환 시 제거됨. 벡터 잎 물리가 없어짐. post-hackathon에서 PNG 기반으로 재구현 예정.

### 성장 단계별 분기

```
babble (D+0~7):
  클릭 → "." 트리거 → 랜덤 fragment → 말풍선 + 웅얼웅얼
  입력창 없음

curious (D+8+):
  클릭 (짧게) → 맥락 기반 fragment
  롱프레스 → 입력창 열림 → 사용자 텍스트 → LLM → 말풍선 + 웅얼웅얼
  ⏏ 버튼 → 이전 대화 기록 펼침/접기
```

### IPC 흐름 (대화)

```
renderer: 롱프레스 감지 → 입력창 열림
  → 사용자 텍스트 입력 + Enter
  → IPC "minari:converse"
  → main: getRecentHistory(8) + curiousSystemPrompt(mood)
  → main: callOllama(system + history + userText)
  → main: filterGuardrails(response)
  → main: DB 저장 + noteSpoken
  → IPC 응답
  → renderer: 입력창 닫힘 → bubble.show + 웅얼웅얼
```

※ callOllama 네이밍은 Ollama 시절 잔재. 내부적으로 llama.cpp 호출. 리네임은 post-hackathon.

---

## 6. 클릭 관통 (구현 완료, 플랫폼별 분기)

### macOS
```
setIgnoreMouseEvents(true, { forward: true })
  → hover 이벤트 전달 → 히트 마스크 판정 → CT 토글
```

### Windows (커서 폴링)
```
setIgnoreMouseEvents(true) — forward 없음 (macOS 전용)
  → 메인 프로세스에서 30ms 간격 커서 폴링
  → screen.getCursorScreenPoint() - win.getBounds() → 창 상대좌표
  → IPC(minari:cursor)로 렌더러에 전달
  → 렌더러가 기존 hitTest()(알파 마스크) 재사용
  → hit → CT OFF, miss → CT ON
  → 상태 변할 때만 토글 (깜빡임 방지)
  → isPointerDown 가드: 누르고 있는 동안 CT 토글 스킵 (롱프레스 보호)
  → 창 minimize/hide 시 폴링 정지
```

pointerBridge.ts에 플랫폼 분기 집중.

### 이미지 드롭 (Mac)
pointermove `e.buttons !== 0` 감지 → CT OFF → drop 도달 → CT 복구. 포즈 리팩토링 과정에서 깨졌다가 복구됨 (2026-05-17).

### 채용된 해결책:
- **D) 롱프레스(0.5초+)**: 짧은 클릭은 전부 관통. 0.5초 이상 누르면 Minari에 닿음. "쓰다듬기" 느낌과 부합. 실수 클릭 방지.
- **드래그 이동**: Minari를 잡아 올리면 고양이처럼 축 처짐. 내려놓으면 털썩 앉아서 두리번. 사용자가 원하는 위치로 이동 가능.
- **아티팩트 던지기 → fetch 놀이**: 화면 가장자리 아이템을 집어서 던지면 Minari가 주워옴. 대화 없이 정드는 상호작용. **post-hackathon**.
- 드래그 이동과 fetch 놀이는 **새싹 이후 성장 단계에서만 해금** (새싹은 뿌리 박혀서 못 움직임).

**폐기된 후보:**
- ~~A) Option키+클릭~~ — 키보드 단축키가 "직접 클릭만" 철학과 거리
- ~~B) 트레이/독 아이콘 진입~~ — "클릭으로 관계 시작" 감성 약해짐
- ~~C) 화면 가장자리 고정~~ — "치워버리면 너무 쉬운 해결", 존재감 훼손

---

## 7. 캐릭터 물리 (구현 완료)

### 숨쉬기
Y축 ±3% / X축 ∓1.5% 스케일 + 잎 기울어짐. 5초 주기. sine easing. **모든 포즈에서 유지.**

### 까딱 (클릭)
damped oscillation. amplitude 0.2rad, omega 2π/0.7, damping 4, duration 0.85s. 호흡 위에 중첩. **idle 포즈에서만 동작** — 앉기 포즈(reading/diary)에서는 비활성화 (poses.ts `tilt: false`).

### 쓰다듬기 (커서 이동)
~~잎 위 커서 → 이동 방향으로 잎 휘어짐~~ — Live2D → 스프라이트 전환으로 제거. post-hackathon 재구현.

---

## 7-1. 앉기 포즈 시스템 (구현 완료)

### 포즈 3종

| 포즈 | body | face (blink) | 그림자 | 까딱 |
|------|------|-------------|--------|------|
| idle | body.png | open/closed/half/smile/surprise/tiltL/tiltR | ✅ (Y-8) | ✅ |
| reading | sit_readingbook.png | half↔closed (반쯤 감은 게 기본) | ❌ | ❌ |
| diary | diary_body.png | open→half→closed→half→open | ❌ | ❌ |

### 구현
- poses.ts: Pose 타입 + POSES 설정 (body/face/tilt/hitMaskSprites/shadowYOffset)
- MINARI_POSE env로 강제 진입. 런타임 전환은 setPose() 구조 준비됨 (미구현).
- snapshot resume에서 activity → 포즈 매핑 (reading activity → reading 포즈)
- hit mask: 포즈별 body+face 컴포지트. 앉기는 폭 넓고 높이 낮음.
- 말풍선 위치: bubbleAnchorY() — 포즈별 headTopY 동적 계산.

### 이미지 보정
- diary_body.png: centerX 50px 시프트 (601→651, idle body.png 기준 정렬)
- diary_face_*: centerX 24px 시프트 (625.5→649.5)
- body-face 관계 -1.5px, idle과 일치.

---

## 8. 사운드 시스템 — 웅얼웅얼 (구현 완료)

**방식**: 실제 음성 샘플 기반 (합성음 폐기 — 전자음 느낌)

```
assets/sounds/ — 15개 wav 샘플
├── 모음: a, e, i, o, u
├── 비음: eum, heum, eu, ang
├── 자음: dda, bba, gga
└── 기식음: ha, ho, hi
```

- 글자→샘플 매핑: 모음은 매칭, 자음은 랜덤 선택, 마침표/공백은 무음 pause
- 피치: playbackRate = voiceHz / 120Hz (SAMPLE_REFERENCE_HZ)
- 닉네임 시드: djb2 해시 → 200~260Hz 기본 피치. 같은 닉네임 = 같은 목소리
- mood 변조: calm(느리고 낮게) / curious(빠르고 높게, 끝 올림) / sleepy(아주 느리고 작게)
- 말풍선 show()와 동기 재생
- 톤: "나긋나긋한 맛" — 동물의 숲보다 느린 속도가 Minari에 맞음

### 물음표 끝음 상승 (세션 9-10 추가)
물음표로 끝나는 텍스트는 마지막 샘플의 피치를 ×1.3~1.4 올림. mood의 endRise 설정보다 우선. 되묻기("pizza?")에서 자연스러운 억양 생성.

### 탄생 4비트 mumble (세션 9-10 추가)
D+0 탄생 시 이름 부여 직후, 4개 음절로 자기 이름을 되뇌는 mumble 재생. 기존 firstFragment(LLM 랜덤 출력) 대체 — "감정적 피크를 LLM 랜덤 출력이 깎으면 안 된다"는 판단.

### 한글 음소 매핑
pickSampleName에 한글 지원 추가. 한글 음절(U+AC00~D7A3)을 자모 분해:

| 한글 | 샘플 |
|------|------|
| 모음 ㅏㅑ | a |
| 모음 ㅓㅕㅗㅛㅝ | o |
| 모음 ㅜㅠㅡ | u |
| 모음 ㅣ | i |
| 모음 ㅔㅐㅖㅒ | e |
| 초성 ㄴㅁ | 비음 (eum/heum/eu/ang 랜덤) |
| 초성 ㄲㄸㅃ | 된소리 (dda/bba/gga) |
| 초성 ㅎ | 기식음 (ha/ho/hi 랜덤) |
| 기타 초성 | 자음 랜덤 |

한 음절에서 초성→자음샘플 + 중성→모음샘플 순서로 스케줄.
라틴 글자는 기존 1개 매핑 유지. 혼합 텍스트도 처리.

예: "그게 뭐야?" → [ho, u, bba, e, ang, o, bba, a] 8개 샘플.

---

## 9. 이미지 선물 (구현 완료)

**흐름**: 사용자가 이미지를 Minari 창에 드래그 앤 드롭

```
Finder에서 이미지 드래그 시작
  → pointermove에서 e.buttons !== 0 감지 → click-through OFF
  → dragenter/dragover/drop 정상 도달
  → main: 이미지 base64 → llama.cpp 비전 API (gemma4:e2b)
  → toddler 반응 ("warm spotty circles.")
  → guardrails → DB 저장 → 말풍선 + 웅얼웅얼
  → drop 완료 시 click-through 복구
```

- click-through 해결: 드래그 중 buttons!=0 감지로 자동 전환 (우클릭/모드 전환 불필요)
- diary 연동: [image gift]가 conversations에 저장 → 일기 생성 시 자동 참조

### 한국어 지원
- MINARI_LANG=ko일 때 비전 응답도 한국어 (영어 금지 디렉티브)
- 되묻기 질문: extractKeywords 한글 대응 (/[^가-힣]+/ 분리)
- 한국어 되묻기 템플릿 4종:
  - "그거... {kw}... 이름 뭐야?"
  - "음... {kw}... 뭐라고 불러?"
  - "{kw}... 그거 뭐야?"
  - "아까 그거... {kw}. 이게 뭐야?"

---

## 9-1. 단어 배움 시스템 (✅ 구현 완료)

> 상세 설계: `word-learning-spec.md` 별도 문서

**핵심 흐름**:
```
이미지 드롭 → E2B 비전 → "warm spotty circles." (모름)
  → learned_words 테이블에 unknown으로 저장
  → 시간 경과 (D+8 이상, 호기심 단계)
  → soft_ping 트리거: "that thing... spotty circles... what name?"
  → 사용자 입력 "pizza"
  → Minari 되묻기: "pizza?"
  → 사용자 확인 "yes"
  → Minari 음미: "pizza-"
  → status='learned', 일기 자동 기록
  → 다음에 같은 종류 이미지 → "pizza!" (배운 단어 사용)
```

**핵심 결정**:
- 시스템 프롬프트에 학습 단어 못 넣음 (~90단어 제약) → post-processing 매칭
- 키워드 기반 매칭 (LLM 시맨틱 매칭은 너무 무거움)
- 질문은 템플릿 기반, 반응은 코드로 조합 (하드코딩 아님 — 실제 로직)
- 일기는 Minari 언어로 기록: "jy gave warm spotty circles. warm spotty circles has name now: pizza."

**DB 스키마**: learned_words (unknown → curious → learned 3단계)

**상태 추적**: state 테이블의 teaching_word_id, confirming_word로 2단계 가르침 모드 관리

**구현 상세 (W3)**:
- `src/main/wordLearning/`: match.ts, keywords.ts, repo.ts, teachingState.ts
- 매처 threshold 0.5 → 0.3 조정 (E2B 어휘 변동 대응)
- vision_raw merge: 매칭 성공 시 새 토큰 union → 시간이 지날수록 매칭 풀 풍부해짐
- 73/73 회귀 + E2E 검증 완료 (피자, 한국어 포함)

---

## 9-2. 코딩 에이전트 알람 연동 (✅ 구현 완료)

**컨셉**: Minari는 알림 도구가 아니라 **알림에 영향받는 존재**.
Codex Pets / Claude Buddy는 상태 표시기. Minari는 룸메이트.

**흐름**:
```
Claude Code hook 이벤트 (TaskCompleted, Notification)
  → ~/.claude/settings.json에 등록된 hook이 IPC로 Minari에 전달
  → Minari 반응 (상황별):
    - startled jump (깜짝 놀라기)
    - annoyed glare (째려보기)
    - "...done." (귀찮은 듯 전달)
    - "...loud." (불만)
  → DB 기록 (conversations + 알람 컨텍스트)
```

**구현**:
- `src/main/alarm/`: reactions.ts (4종), server.ts (127.0.0.1:47823)
- `scripts/alarm-hook.js` (Claude Code hook 엔트리), `scripts/demo-alarm.js`
- startle() 애니메이션: amplitude 0.45, duration 1.1s, damping 3
- Claude Code hook 실제 등록 + E2E 검증 완료 (4종 모두 fire 확인)

---

## 10. 파일 구조 (최종)

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
│   │   ├── birth.ts             ← D+0 상태 머신 + pet_name
│   │   ├── growth.ts            ← 성장 단계 (babble/curious)
│   │   ├── identity.ts          ← pet_name 캐시
│   │   ├── snapshot.ts          ← snapshot 저장/복원/boot state 계산
│   │   ├── softPing.ts          ← soft ping 스케줄러 (dev/prod 분기)
│   │   ├── diary.ts             ← 일기 자동 생성
│   │   ├── pointerBridge.ts     ← 플랫폼별 CT + Windows 커서 폴링
│   │   ├── memory/ (db.ts, repo.ts)
│   │   ├── llm/ (ollama.ts, prompts.ts, guardrails.ts, speak.ts,
│   │   │       birthFragment.ts, pingFragment.ts, imageReact.ts,
│   │   │       converse.ts, model.ts, recentSpoken.ts, keywords.ts)
│   │   ├── wordLearning/ (match.ts, keywords.ts, repo.ts, teachingState.ts)
│   │   └── alarm/ (reactions.ts, server.ts)
│   ├── renderer/
│   │   ├── index.html, index.ts  ← 4제스처 분기 (click/longpress/drag/drop)
│   │   ├── pet/Minari.ts         ← 포즈별 스프라이트/hit mask/말풍선/그림자
│   │   ├── pet/poses.ts          ← 포즈 시스템 (Pose 타입 + POSES 설정)
│   │   ├── birth/ (Seed.ts, NicknamePrompt.ts, runBirthScene.ts)
│   │   ├── resume/runResumeScene.ts
│   │   ├── sound/mumble.ts       ← 음성 샘플 기반 웅얼웅얼 + 한글 음소
│   │   └── ui/ (Bubble.ts, CuriousPrompt.ts)
│   ├── preload/index.ts
│   └── shared/ (types.ts, constants.ts, api.d.ts, snapshot.ts,
│               softPingSuppression.ts)
├── assets/
│   ├── sprites/  ← body/face PNG 에셋 (idle + reading + diary)
│   └── sounds/   ← 15개 wav 음성 샘플
├── scripts/ (test-ollama.ts, regression.ts, alarm-hook.js, demo-alarm.js)
└── docs/
```

---

## 11. 의존 방지 7대 장치 (설계)

1. **절대 먼저 해결하지 않음**: 조언/코칭/진단 금지
2. **하루 대화 상한**: 자연스럽게 대화를 줄임
3. **외부 연결 제안**: "오늘 누구 만나?" 같은 은근한 사회성 자극
4. **빈자리 미학**: 앱 꺼도 Minari가 잘 지내고 있다는 흔적
5. **성장 감속**: 일정 단계 이후 관계가 급격히 깊어지지 않음
6. **명시적 선언**: Minari 스스로 "나는 충분하지 않아" 인정
7. **윤리 하드라인**: 자해/자살/타인가해/미성년자 → 캐릭터 모드 즉시 중단

구현: post-hackathon.

---

## 12. 구현 완료 체크리스트

### 해커톤 제출 완료 (2026-05-18)

- [x] D+0 탄생 연출 (발아 + 닉네임 + 이름 되뇌기 mumble + 첫 호흡)
- [x] 탄생 시퀀스 폴리시 (눈 감은 채 등장→8초 깊은 호흡→눈뜨기, 비차단 입력)
- [x] snapshot resume (4 bucket: same_moment/quiet_shift/new_cycle/new_day)
- [x] soft ping (dev/prod 분기, 억제 조건 6개)
- [x] 일기 자동 생성 (종료 시 1줄) + 일기 엿보기 (diary 포즈 클릭)
- [x] 재실행 복구 (birth 중단 재진입 + resume 정상)
- [x] 웅얼웅얼 사운드 (실제 음성 샘플 15개 + 닉네임 시드 + mood 변조 + 한글 음소)
- [x] 물음표 끝음 상승
- [x] 이미지 선물 (드래그 앤 드롭 → Gemma 4 비전 → 반응 + 웅얼웅얼)
- [x] 단어 배움 시스템 (73/73, threshold 0.3 + vision_raw merge)
- [x] 코딩 에이전트 알람 연동 (HTTP 서버 + 4종 reaction + demo:alarm)
- [x] E2B 호환성 (mode collapse 해결 93% unique, 비전 5/5)
- [x] 호기심 단계 (롱프레스 → 입력창 → 맥락 대화, growth_stage 자동 전환)
- [x] pet_name 하드코딩 제거 → 동적 주입
- [x] injection 방어 ("soil and dew.")
- [x] 드래그 이동 (창 위치 기억)
- [x] 앉기 포즈 2종 (읽기 + 일기) — 스프라이트/깜빡임/hit mask/그림자 비활성화
- [x] 한국어 프롬프트 (동적 샘플링 + 아기말 예시)
- [x] 한국어 되묻기 템플릿
- [x] Windows 커서 폴링 (롱프레스/드롭 동작)
- [x] Mac 이미지 드롭 복구
- [x] 밉맵 적용 (저해상도 계단현상 개선)
- [x] 닉네임 입력 UI Frutiger Aero 리디자인
- [x] Curious Prompt UI (Frutiger Aero, 독립 글래스 표면, 드래그, 히스토리)
- [x] ⏏ long-press 메뉴 (♪ 볼륨 / ⌽ 종료) + 슬라이드/페이드 + 자동 닫기
- [x] UI 영문화
- [x] 회귀 테스트 73/73 + typecheck 통과
- [x] 데모 영상 촬영 + 자막 하드코딩 (SRT+ffmpeg+Pillow)
- [x] Kaggle 제출 + GitHub public 전환

### post-hackathon 남은 것

- [ ] callOllama 리네임 (llama.cpp 전환 후 코드 네이밍 잔재)
- [ ] 일반 무지 디렉티브 (음식 등 아는 척 방지)
- [ ] 이름 거부 기능 (ESC → "이름을 모르는 채로도 함께 있을 수 있다")
- [ ] 자기 이름 짓기 (호기심 단계, 기억에서 단어 골라 자기 이름 생성)
- [ ] 컨디션 시스템 (energy + fatigue_debt + mood_seed)
- [ ] 퀄리아 시스템 (감각-감정-시간 공명 기반 기억)
- [ ] 단어 학습 패턴 변형 (컨디션/퀄리아에 따라 다른 경로)
- [ ] 성장 3~4단계 (친밀/공명)
- [ ] 의존 방지 장치 완전 구현
- [ ] Live2D 재도입 (스프라이트→Live2D 파라미터 매핑 확인됨)
- [ ] 캐릭터 아트 저해상도 에셋 별도 제작

---

## 13. Windows 빌드 상태

### 해결된 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| 스프라이트 빈 박스 | file:// URL | app:// 커스텀 프로토콜 |
| 롱프레스 안 됨 | forward macOS 전용 + babble 게이트 | 커서 폴링 + MINARI_STAGE=curious |
| 소리 안 남 | 한글 음소 매핑 없음 | 자모 분해 매핑 |
| 스프라이트 깨짐 | 10배 축소 밉맵 없음 | autoGenerateMipmaps + MINARI_SCALE=0.085 |
| always-on-top 이탈 | Windows 기본 레벨 | screen-saver + blur 재적용 |

### 알려진 한계
- 비전: 45초 (mmproj + CPU only). 수정 불가.
- 저해상도 화질: 밉맵으로 개선했으나 근본적으로 1300×2000→~110px 축소. 저해상도 에셋 별도 필요 (post-hackathon).

### start-minari.bat
```
set MINARI_STAGE=curious
set MINARI_SCALE=0.085
set MINARI_DEVTOOLS=1
```
