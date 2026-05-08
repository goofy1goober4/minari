# 단어 배움 시스템 (Word Learning System) — 구현 설계서

> Minari v0.2.0 — Claude Code 핸드오프용
> 2026-05-05 (모델 E2B 전환, pizza 반응 + 일기 템플릿 반영)

---

## 0. 이 기능이 뭔지

Minari가 이미지를 받았을 때 모르는 것을 자기 식으로 표현하고,
나중에 사용자에게 물어서 **단어를 배우는** 시스템.

```
D+3:  피자 사진 드롭 → "red cheese circles."     ← 모른다
D+10: Minari가 먼저 → "that thing... red circles... what name?"
      사용자: "pizza"
      Minari: "pizza?" (되묻기)
      사용자: "yes"
      Minari: "pizza-" (늘이며 음미)         ← 배웠다
D+11: 피자 사진 드롭 → "pizza!"               ← 기억한다
```

**"이 존재가 나한테 배운다"** — 해커톤 데모의 핵심 장면.

> **모델**: Gemma 4 E2B (해커톤 기본). E2B 비전이 덜 정확한 게 오히려
> baby description을 자연스럽게 만들어줌. E4B는 env 전환으로 유지.

> **⚠️ 하드코딩 금지 원칙**: 해커톤 제출물은 public repo + working demo + Reproducibility 심사.
> 모든 기능은 실제로 동작해야 함. 비전 결과 조작, 가짜 반응, mocked UI 절대 불가.
> 데모 촬영 시에는 여러 테이크 중 좋은 걸 선택하되, 결과 자체를 조작하지 않음.
> 허용되는 것: dev 모드 시간 가속(파라미터), 성장 단계 초기화(상태 리셋), 수동 이벤트 트리거(테스트 유틸리티).

---

## 1. DB 스키마

### 새 테이블: `learned_words`

```sql
CREATE TABLE learned_words (
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

CREATE INDEX idx_learned_status ON learned_words(status);
CREATE INDEX idx_learned_name ON learned_words(learned_name);
```

### 상태 흐름

```
unknown ──→ curious ──→ learned
  │            │
  │  (시간 경과,    │  (사용자가
  │   호기심 단계)  │   알려줌)
  │            │
  최초 이미지     Minari가
  드롭 시 생성    물어본 후
```

---

## 2. 수정할 기존 흐름

### 2.1 이미지 선물 흐름 (기존 → 변경)

**기존:**
```
이미지 드롭 → vision API → toddler 반응 → DB(conversations) 저장 → 버블
```

**변경:**
```
이미지 드롭
  → vision API로 raw description 획득
  → learned_words에서 유사 단어 검색 (status='learned')
  → [매칭 있음] → 배운 단어로 반응: "pizza!"
  → [매칭 없음] → baby description 그대로: "red cheese circles."
                 → learned_words에 새 row 삽입 (status='unknown')
  → DB 저장 → 버블 + 웅얼웅얼
```

### 2.2 호기심 질문 트리거 (새로 추가)

soft_ping 시스템에 **단어 질문 ping** 유형 추가.

**발동 조건:**
- 성장 단계 ≥ 호기심 (D+8 이상)
- learned_words에 status='unknown'인 row가 있음
- 해당 row의 first_seen_at이 3일(dev: 30초) 이상 전
- 최근 24시간(dev: 60초) 이내에 단어 질문 ping을 안 했음

**흐름:**
```
soft_ping 타이머 체크
  → 조건 충족 시 가장 오래된 unknown word 선택
  → baby_description에서 핵심 단어 추출
  → 질문 생성: "that thing... [핵심 단어]... what name?"
  → 버블 표시 (입력창 자동 열림)
  → status를 'curious'로 변경
  → 사용자 응답 대기
```

### 2.3 사용자가 가르치는 흐름 (새로 추가)

**트리거:** status='curious'인 word가 있는 상태에서 사용자 입력이 들어옴

**흐름:**
```
사용자 입력 수신 (호기심 대화 중)
  → 현재 curious 상태인 word 확인
  → [curious word 있음]
     → 입력을 learned_name으로 저장
     → 1단계 반응: "[word]?" (되묻기) — 입력창 유지
     → 사용자 확인 ("yes" 등) 대기
     → 2단계 반응: "[word]-" (늘이며 음미)
     → status='learned', learned_at=now
     → 일기 생성: "[nickname] gave [baby_description]. [baby_description] has name now: [word]."
     → mumble mood = 'curious' → 'excited' (되묻기는 궁금, 확인 후는 신남)
  → [curious word 없음]
     → 일반 대화 흐름
```

---

## 3. 비전 → 단어 매칭 로직

**50단어 제약 때문에** learned_words를 시스템 프롬프트에 넣을 수 없음.
대신 **post-processing**으로 처리:

### 3.1 이미지 드롭 시 매칭

```typescript
async function handleImageGift(imagePath: string) {
  const visionRaw = await callOllamaVision(imagePath);
  
  const learnedWords = db.prepare(
    `SELECT learned_name, baby_description, vision_raw 
     FROM learned_words WHERE status = 'learned'`
  ).all();
  
  const match = findBestMatch(visionRaw, learnedWords);
  
  if (match) {
    return `${match.learned_name}!`;
  } else {
    const response = await generateToddlerReaction(visionRaw);
    
    db.prepare(`
      INSERT INTO learned_words (baby_description, vision_raw, image_path, status)
      VALUES (?, ?, ?, 'unknown')
    `).run(response, visionRaw, imagePath);
    
    return response;
  }
}
```

### 3.2 매칭 전략 (심플 버전)

LLM 기반 시맨틱 매칭은 너무 무거움. 키워드 기반으로 충분:

```typescript
function findBestMatch(
  newVisionRaw: string, 
  learnedWords: LearnedWord[]
): LearnedWord | null {
  const newWords = new Set(
    newVisionRaw.toLowerCase().split(/\s+/)
  );
  
  let bestMatch: LearnedWord | null = null;
  let bestScore = 0;
  
  for (const lw of learnedWords) {
    const oldWords = new Set(
      lw.vision_raw.toLowerCase().split(/\s+/)
    );
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

**왜 이게 되나:** Gemma 4 E2B 비전은 같은 종류의 이미지에 비슷한 키워드를 씀. 피자 사진 → "round", "cheese", "red", "food" 등이 반복됨. 50%+ 키워드 겹침이면 같은 종류로 판단해도 됨. E2B가 E4B보다 어휘가 단순해서 오히려 매칭률이 높을 수 있음.

**한계:** 완전히 다른 각도의 피자 사진은 매칭 실패할 수 있음. 하지만 데모 범위에서는 충분함.

---

## 4. 호기심 질문 생성

### 4.1 질문 템플릿

50단어 제약 때문에 LLM을 안 쓰고 **템플릿 기반**:

```typescript
const CURIOSITY_TEMPLATES = [
  "that thing... {keywords}... what name?",
  "mm... {keywords}... what called?",
  "{keywords}... what?",
  "remember... {keywords}. what is?",
];

function generateCuriosityQuestion(word: LearnedWord): string {
  const keywords = extractKeywords(word.baby_description, 3);
  const template = pickRandom(CURIOSITY_TEMPLATES);
  return template.replace('{keywords}', keywords);
}

function extractKeywords(desc: string, max: number): string {
  const stopwords = new Set(['a', 'the', 'is', 'it', 'oh', 'mm', 'hmm']);
  return desc
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => !stopwords.has(w) && w.length > 1)
    .slice(0, max)
    .join(' ');
}
```

### 4.2 ping_type 확장

기존 soft_pings 테이블의 ping_type에 `'word_curiosity'` 추가:

```typescript
{
  type: 'word_curiosity',
  check: () => {
    const growth = getGrowthStage();
    if (growth === 'babbling') return false;
    
    const unknownWord = db.prepare(`
      SELECT * FROM learned_words 
      WHERE status = 'unknown'
      AND first_seen_at < unixepoch() - ?
      ORDER BY first_seen_at ASC
      LIMIT 1
    `).get(DEV_MODE ? 30 : 3 * 86400);
    
    if (!unknownWord) return false;
    
    const recentAsk = db.prepare(`
      SELECT * FROM soft_pings 
      WHERE ping_type = 'word_curiosity'
      AND created_at > unixepoch() - ?
      LIMIT 1
    `).get(DEV_MODE ? 60 : 86400);
    
    return !recentAsk;
  },
  generate: (word) => generateCuriosityQuestion(word),
  afterShow: (word) => {
    db.prepare(`UPDATE learned_words SET status = 'curious' WHERE id = ?`)
      .run(word.id);
  }
}
```

---

## 5. 가르침 수신 처리

### 5.1 호기심 대화 컨텍스트

Minari가 단어를 물어본 직후에는 **teaching mode**가 활성화됨.

```typescript
function enterTeachingMode(wordId: number) {
  db.prepare(`
    INSERT OR REPLACE INTO state (key, value) 
    VALUES ('teaching_word_id', ?)
  `).run(wordId.toString());
}

function exitTeachingMode() {
  db.prepare(`DELETE FROM state WHERE key = 'teaching_word_id'`).run();
}

function getTeachingWordId(): number | null {
  const row = db.prepare(
    `SELECT value FROM state WHERE key = 'teaching_word_id'`
  ).get();
  return row ? parseInt(row.value) : null;
}

function enterConfirmingMode(wordId: number, pendingName: string) {
  db.prepare(`
    INSERT OR REPLACE INTO state (key, value) 
    VALUES ('confirming_word', ?)
  `).run(JSON.stringify({ id: wordId, pendingName }));
}

function exitConfirmingMode() {
  db.prepare(`DELETE FROM state WHERE key = 'confirming_word'`).run();
}

function getConfirmingWordId(): { id: number; pendingName: string } | null {
  const row = db.prepare(
    `SELECT value FROM state WHERE key = 'confirming_word'`
  ).get();
  return row ? JSON.parse(row.value) : null;
}
```

### 5.2 사용자 입력 처리 분기

기존 호기심 대화 흐름에 teaching 분기 추가:

```typescript
async function handleUserInput(input: string) {
  const teachingWordId = getTeachingWordId();
  const confirmingWord = getConfirmingWordId();
  
  if (confirmingWord) {
    // === 확인 모드 (2단계: 사용자가 "yes" 등으로 확인) ===
    const word = db.prepare(
      `SELECT * FROM learned_words WHERE id = ?`
    ).get(confirmingWord.id);
    
    const isConfirm = ['yes', 'yeah', 'yep', 'y', 'right', 'correct']
      .includes(input.trim().toLowerCase());
    
    if (isConfirm && word) {
      const learnedName = confirmingWord.pendingName;
      
      db.prepare(`
        UPDATE learned_words 
        SET learned_name = ?, status = 'learned', learned_at = unixepoch()
        WHERE id = ?
      `).run(learnedName, word.id);
      
      exitConfirmingMode();
      
      const response = `${learnedName}-`;
      
      const nickname = db.prepare(
        `SELECT value FROM state WHERE key = 'nickname'`
      ).get()?.value || 'you';
      
      db.prepare(`
        INSERT INTO diary (content, mood) 
        VALUES (?, 'happy')
      `).run(`${nickname} gave ${word.baby_description}. ${word.baby_description} has name now: ${learnedName}.`);
      
      db.prepare(`INSERT INTO conversations (role, content) VALUES ('user', ?)`)
        .run(input);
      db.prepare(`INSERT INTO conversations (role, content) VALUES ('minari', ?)`)
        .run(response);
      
      return {
        text: response,
        mood: 'excited',
      };
    } else {
      exitConfirmingMode();
      return handleNormalInput(input);
    }
  }
  
  if (teachingWordId) {
    // === 가르침 모드 (1단계: 사용자가 단어를 알려줌 → 되묻기) ===
    const word = db.prepare(
      `SELECT * FROM learned_words WHERE id = ?`
    ).get(teachingWordId);
    
    if (!word) {
      exitTeachingMode();
      return handleNormalInput(input);
    }
    
    const learnedName = input.trim().toLowerCase().split(/\s+/)[0];
    
    exitTeachingMode();
    enterConfirmingMode(word.id, learnedName);
    
    const response = `${learnedName}?`;
    
    db.prepare(`INSERT INTO conversations (role, content) VALUES ('user', ?)`)
      .run(input);
    db.prepare(`INSERT INTO conversations (role, content) VALUES ('minari', ?)`)
      .run(response);
    
    return {
      text: response,
      mood: 'curious',
    };
  }
  
  // === 일반 대화 ===
  return handleNormalInput(input);
}
```

---

## 6. 일기 연동

일기 템플릿은 **Minari의 언어**로 작성:

```
기존 (폐기): "learned pizza from jy today."
확정:        "jy gave red circles. red circles has name now: pizza."
```

Minari는 "학습했다(learned)"가 아니라 "이름이 생겼다(has name now)"로 기억함.
baby_description을 계속 사용하는 게 핵심 — 자기 세계관 안에서 기록.

```typescript
function createLearnedWordDiaryEntry(
  nickname: string, 
  babyDesc: string, 
  learnedName: string
): string {
  return `${nickname} gave ${babyDesc}. ${babyDesc} has name now: ${learnedName}.`;
}
```

일기는 가르침 확인 시점(confirming mode에서 "yes" 후)에 즉시 기록됨 (5.2 참고).

---

## 7. 데모 시나리오에서의 흐름

해커톤 데모 3분 영상에서 보여줄 시퀀스 (소설화 v4 기준):

```
[1:15] 사용자가 그림판에서 그린 피자 그림을 드래그 → Minari 위에 드롭
       Minari: "red cheese circles." + 웅얼웅얼

[1:25] 화면 전환 (밤 실사 → 밝은 날 실사)
       Minari가 먼저 말풍선: "that thing... red circles... what name?"
       입력창이 올라옴

[1:30] 사용자 입력: "pizza"
       Minari: "pizza?" (되묻기, curious 톤)

[1:33] 사용자: "yes"
       Minari: "pizza-" (늘이며 음미, 신난 웅얼웅얼)

[1:42] 일기 화면: "jy gave red circles. red circles has name now: pizza."
```

### 데모용 시간 가속

```typescript
const DEV_MODE = process.env.NODE_ENV === 'development';

const CURIOSITY_DELAY = DEV_MODE ? 30 : 3 * 86400;      // 30초 vs 3일
const CURIOSITY_COOLDOWN = DEV_MODE ? 60 : 86400;        // 60초 vs 24시간
const MIN_GROWTH_STAGE = 'curiosity';                     // D+8, 데모에서는 강제 설정 가능
```

데모 시 성장 단계를 강제로 '호기심'으로 설정:
```typescript
db.prepare(`INSERT OR REPLACE INTO state (key, value) VALUES ('growth_stage', 'curiosity')`).run();
db.prepare(`INSERT OR REPLACE INTO state (key, value) VALUES ('days_since_hatch', '10')`).run();
```

---

## 8. 구현 순서 (Claude Code 작업 단위)

```
Step 1: DB 마이그레이션
  - learned_words 테이블 생성
  - 기존 db.ts 초기화에 추가

Step 2: 이미지 선물 흐름 수정
  - handleImageGift에 learned_words 검색 추가
  - 매칭 시 배운 단어로 반응
  - 미매칭 시 unknown으로 저장
  - Ollama 비전 호출은 E2B (gemma4:e2b)

Step 3: 호기심 질문 ping
  - ping-rules에 word_curiosity 타입 추가
  - 질문 템플릿 + 키워드 추출
  - teaching mode 진입

Step 4: 가르침 수신 (2단계)
  - handleUserInput에 teaching → confirming 분기
  - 1단계: 사용자 입력 → "pizza?" 되묻기 (curious mood)
  - 2단계: "yes" 확인 → "pizza-" 음미 (excited mood)
  - learned_words 업데이트
  - 일기 자동 기록 (Minari 언어 템플릿)

Step 5: 테스트 + 데모 준비
  - dev 모드 시간 가속
  - 성장 단계 강제 설정
  - 전체 흐름 E2E 테스트
  - E2B 비전 baby description 품질 확인
```

---

## 9. 50단어 제약 하에서의 핵심 결정

| 결정 | 이유 |
|------|------|
| 시스템 프롬프트 수정 안 함 | 50단어 넘으면 60% 빈 응답 |
| 매칭은 post-processing | LLM에 단어 목록 넣으면 프롬프트 폭발 |
| 질문은 템플릿 기반 | LLM에 "물어봐"라고 시키면 프롬프트 필요 |
| 반응은 템플릿 생성 | "pizza?" → "pizza-"는 LLM 없이 코드로 조합 (※ 가짜 아님, 실제 로직) |
| 비전 분석만 LLM 사용 | 이미지 → 텍스트 변환만 Ollama 호출 (E2B), 결과 조작 없음 |

**원칙: LLM은 "보는 것"에만 쓰고, "기억하고 말하는 것"은 시스템이 한다.**
이게 뉴로사마 원칙의 Minari 버전.

> **참고**: "시스템이 한다" ≠ 하드코딩/조작. 비전 결과는 실제 E2B 호출이고,
> 템플릿 반응("pizza?")은 그 결과를 기반으로 코드가 조합하는 것.
> 심사위원이 코드를 봤을 때 정당한 시스템 설계로 읽혀야 함.

---

## 10. 엣지 케이스

| 상황 | 처리 |
|------|------|
| 같은 물체를 다른 이름으로 가르침 | 마지막 가르침이 이김 (UPDATE) |
| 사용자가 빈 문자열 입력 | teaching mode 유지, 재질문 안 함 |
| teaching mode에서 이미지 드롭 | teaching mode 해제 → 이미지 처리 |
| confirming mode에서 "yes" 외 입력 | confirming 해제 → 일반 대화 (다음에 다시 물어봄) |
| confirming mode에서 이미지 드롭 | confirming 해제 → 이미지 처리 |
| 배운 단어가 100개 넘음 | 매칭 성능 OK (키워드 비교는 O(n), n=100은 무시 가능) |
| 비전이 완전 다른 설명을 줌 | 매칭 실패 → 새 unknown으로 추가 (괜찮음, 나중에 또 배움) |
| 앱 재시작 | teaching_word_id, confirming_word가 state에 있으므로 복원됨 |
