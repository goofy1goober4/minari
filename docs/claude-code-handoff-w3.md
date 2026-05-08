# Claude Code 핸드오프 — W3 구현 (2026-05-07)

> **이 문서는 Claude Code / Codex가 바로 구현에 들어갈 수 있도록 정리한 핸드오프다.**
> 설계는 확정됨. 해석이 필요한 부분은 없음. 그대로 붙이면 됨.
> 상세 설계서: `word-learning-spec.md` (별도)

---

## 현재 상태

세로 슬라이스 v0.1.0-mvp **완성됨**:
- [x] D+0 탄생 + 닉네임 + 첫 fragment
- [x] snapshot resume (4 bucket)
- [x] soft ping (dev/prod 분기, 억제 조건 6개)
- [x] 일기 자동 생성
- [x] 재실행 복구 + 회귀 테스트 45/45
- [x] 웅얼웅얼 사운드 (음성 샘플 15개)
- [x] 이미지 선물 (드래그 앤 드롭 → E2B 비전)
- [x] 호기심 단계 (롱프레스 → 입력창 → 맥락 대화)
- [x] 드래그 이동

**데드라인: 2026-05-18 (D-11)**

---

## W3 구현 우선순위

| # | 기능 | 데모 장면 | 중요도 |
|---|------|----------|--------|
| 1 | **단어 배움 시스템** | [1:15–1:55] pizza 장면 + 일기 | 🔴 필수 |
| 2 | **코딩 에이전트 알람 연동** | [2:35–2:45] 쿠키 엔딩 "...loud." | 🔴 필수 |
| 3 | 캐릭터 아트 교체 | 전체 영상 | 🟡 (주용 담당) |
| 4 | 제출 자료 (README, write-up) | — | 🟡 마지막 |

---

## 1. 단어 배움 시스템

### 핵심 한 줄
Minari가 이미지를 받으면 모르는 건 자기 식으로 표현하고("red cheese circles"), 나중에 사용자에게 물어서 단어를 배움("pizza").

### 1-1. DB 마이그레이션

`learned_words` 테이블을 기존 db.ts 초기화에 추가:

```sql
CREATE TABLE IF NOT EXISTS learned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_description TEXT NOT NULL,
  learned_name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK(status IN ('unknown', 'curious', 'learned')),
  image_path TEXT,
  vision_raw TEXT,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  learned_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_learned_status ON learned_words(status);
CREATE INDEX IF NOT EXISTS idx_learned_name ON learned_words(learned_name);
```

상태 흐름: `unknown` → `curious` → `learned`

### 1-2. 이미지 선물 흐름 수정

**기존**: 이미지 드롭 → vision API → toddler 반응 → DB → 버블

**변경**: 이미지 드롭 → vision API → **learned_words 매칭 체크** → 분기

```typescript
async function handleImageGift(imagePath: string) {
  const visionRaw = await callOllamaVision(imagePath); // E2B

  // 배운 단어에서 매칭 검색
  const learnedWords = db.prepare(
    `SELECT learned_name, baby_description, vision_raw 
     FROM learned_words WHERE status = 'learned'`
  ).all();

  const match = findBestMatch(visionRaw, learnedWords);

  if (match) {
    // 배운 단어로 반응
    return `${match.learned_name}!`;
  } else {
    // baby description → LLM toddler 반응 (기존 흐름)
    const response = await generateToddlerReaction(visionRaw);

    // unknown으로 저장
    db.prepare(`
      INSERT INTO learned_words (baby_description, vision_raw, image_path, status)
      VALUES (?, ?, ?, 'unknown')
    `).run(response, visionRaw, imagePath);

    return response;
  }
}
```

### 1-3. 키워드 매칭 (LLM 안 씀)

50단어 시스템 프롬프트 제약 → 시맨틱 매칭 불가. 키워드 겹침으로 충분:

```typescript
function findBestMatch(newVisionRaw: string, learnedWords: LearnedWord[]): LearnedWord | null {
  const newWords = new Set(newVisionRaw.toLowerCase().split(/\s+/));
  let bestMatch: LearnedWord | null = null;
  let bestScore = 0;

  for (const lw of learnedWords) {
    const oldWords = new Set(lw.vision_raw.toLowerCase().split(/\s+/));
    const overlap = [...newWords].filter(w => oldWords.has(w)).length;
    const score = overlap / Math.max(oldWords.size, 1);

    if (score > 0.5 && score > bestScore) {
      bestScore = score;
      bestMatch = lw;
    }
  }
  return bestMatch;
}
```

E2B 비전은 같은 종류 이미지에 비슷한 키워드를 씀. 50%+ 겹침이면 같은 종류.

### 1-4. 호기심 질문 ping

기존 soft ping에 `word_curiosity` 타입 추가.

**발동 조건**:
- 성장 단계 ≥ 호기심 (D+8, dev: 즉시 가능하도록 강제 설정)
- `learned_words`에 `status='unknown'`인 row 존재
- 해당 row의 `first_seen_at`이 3일(dev: 30초) 이상 전
- 최근 24시간(dev: 60초) 이내에 `word_curiosity` ping 안 했음

**질문 생성 — 템플릿 기반 (LLM 안 씀)**:

```typescript
const CURIOSITY_TEMPLATES = [
  "that thing... {keywords}... what name?",
  "mm... {keywords}... what called?",
  "{keywords}... what?",
];

function extractKeywords(desc: string, max: number): string {
  const stopwords = new Set(['a', 'the', 'is', 'it', 'oh', 'mm', 'hmm']);
  return desc.toLowerCase().replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => !stopwords.has(w) && w.length > 1)
    .slice(0, max)
    .join(' ');
}
```

질문 표시 후 `status`를 `'curious'`로 변경, teaching mode 진입.

### 1-5. 가르침 수신 (2단계)

state 테이블로 teaching context 추적:
- `teaching_word_id` — 질문 후 사용자 답변 대기
- `confirming_word` — 되묻기 후 "yes" 대기 (`{id, pendingName}` JSON)

**흐름**:
```
사용자 입력 수신
  → confirming_word 있으면?
    → "yes" 계열 → learned_name 저장, status='learned', 일기 기록
       반응: "pizza-" (mood: excited)
    → 그 외 → confirming 해제, 일반 대화
  → teaching_word_id 있으면?
    → 첫 단어 추출 → confirming_word로 전환
       반응: "pizza?" (mood: curious)
  → 둘 다 없으면 → 일반 대화
```

**"yes" 판정**: `['yes', 'yeah', 'yep', 'y', 'right', 'correct']`

### 1-6. 일기 — Minari 언어

```typescript
// "learned pizza"가 아님 — "이름이 생겼다"
`${nickname} gave ${babyDesc}. ${babyDesc} has name now: ${learnedName}.`
```

예: `"jy gave red cheese circles. red cheese circles has name now: pizza."`

일기는 confirming에서 "yes" 확인 후 즉시 diary 테이블에 INSERT.

### 1-7. 엣지 케이스

| 상황 | 처리 |
|------|------|
| teaching mode에서 이미지 드롭 | teaching 해제 → 이미지 처리 |
| confirming mode에서 이미지 드롭 | confirming 해제 → 이미지 처리 |
| confirming에서 "yes" 외 입력 | confirming 해제 → 일반 대화 |
| 빈 문자열 입력 | teaching mode 유지 |
| 앱 재시작 | state 테이블에서 복원됨 |

### 1-8. 구현 순서

```
Step 1: DB 마이그레이션 — learned_words 테이블
Step 2: 이미지 선물 흐름 수정 — 매칭 + unknown 저장
Step 3: 호기심 질문 ping — word_curiosity 타입
Step 4: 가르침 수신 — teaching → confirming 2단계
Step 5: 일기 연동 — Minari 언어 템플릿
Step 6: 테스트 — dev 모드 시간 가속으로 E2E
```

### 1-9. dev 모드 시간 가속

```typescript
const DEV_MODE = process.env.NODE_ENV === 'development';
const CURIOSITY_DELAY = DEV_MODE ? 30 : 3 * 86400;     // 30초 vs 3일
const CURIOSITY_COOLDOWN = DEV_MODE ? 60 : 86400;       // 60초 vs 24시간
```

데모 준비:
```typescript
db.prepare(`INSERT OR REPLACE INTO state (key, value) VALUES ('growth_stage', 'curiosity')`).run();
db.prepare(`INSERT OR REPLACE INTO state (key, value) VALUES ('days_since_hatch', '10')`).run();
```

---

## 2. 코딩 에이전트 알람 연동

### 핵심 한 줄
Minari는 알림 도구가 아니라, 알람에 영향받는 룸메이트. 알람이 울리면 짜증내는 존재.

### 2-1. 흐름

```
Claude Code hook 이벤트 (TaskCompleted / Notification)
  → ~/.claude/settings.json에 등록된 hook → IPC로 Minari main process 전달
  → 반응 선택 (랜덤 or 상태 기반):
    - startled jump (깜짝 놀라기, 애니메이션)
    - annoyed glare (째려보기)
    - "...done." (귀찮은 듯 전달)
    - "...loud." (불만)
  → conversations DB 기록
  → 버블 + 웅얼웅얼
```

### 2-2. Claude Code hook 등록

`~/.claude/settings.json`에 실제 hook 등록. **가짜 아님** — public repo 심사 대비.

```json
{
  "hooks": {
    "TaskCompleted": {
      "command": "node /path/to/minari/scripts/alarm-hook.js"
    }
  }
}
```

`scripts/alarm-hook.js`가 Minari의 IPC 엔드포인트로 이벤트 전달.

### 2-3. 데모용 수동 트리거

```bash
npm run demo:alarm
```

테스트 유틸리티로 구현. 알람 이벤트를 IPC로 직접 보냄. 하드코딩이 아닌 실제 hook과 동일한 경로를 탐.

### 2-4. 데모에서의 역할

```
[2:25–2:35] 암전. 조용하다. 끝난 것 같다.
[2:35–2:45] 삐빅! 알람 소리. "...loud."
[2:45–3:00] minari — a small roommate on your desktop
```

"still here."는 사용자에게 하는 말. "...loud."는 자기 세계에서 살고 있다는 증거.

---

## 하드 제약 리마인더

- **시스템 프롬프트 50단어 이내** — 넘으면 빈 응답 60%
- **think:false 필수** — 안 끄면 7초
- **E2B 기본** (`gemma4:e2b`) — "3GB model" 피치
- **하드코딩 금지** — public repo, Reproducibility 심사
- **LLM은 "보는 것"에만, "기억하고 말하는 것"은 시스템이** — 뉴로사마 원칙

---

## 참고 문서

| 문서 | 역할 |
|------|------|
| `word-learning-spec.md` | 단어 배움 상세 설계 (전체 코드 포함) |
| `demo-scenario-v4.md` | 데모 영상 3분 소설화 |
| `sprout_design_doc.md` (v0.5.2) | 전체 기술 설계 + 파일 구조 |
| `north_star.md` (v1.7) | 프로젝트 헌법 |
