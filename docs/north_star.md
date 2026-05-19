# Minari (미나리) — 북극성 문서 v2.1

> *의심이 들 때, 아이디어가 넘칠 때, 길을 잃을 때 — 여기로 돌아올 것.*
> *마지막 수정: 2026-05-19 (해커톤 제출 완료)*

-----

## 1. 한 줄 정의

**Minari는 조언하지 않고 곁에 있어주는, 의존 유발 없는 디지털 애착인형이다.**

> *An offline-first digital transitional object: a warm AI companion that holds space instead of taking over.*

캐치프레이즈: **"The grown-up's plushie. Except this one notices you back."**

-----

## 2. 데모 대상 사용자

**퇴근 후 지쳐 있고, 혼자 있는 건 버겁지만 조언은 원치 않는 지식노동자.**

- 20~40대, 도시 거주, 1인 가구 많음
- 업무로 뇌가 이미 지쳐있음
- 인간관계는 피곤, 혼자는 외로움
- 기존 AI 챗봇은 "너무 말 많아서" 싫어함
- 고양이를 키우고 싶지만 여건상 못 키우는 사람

**이 페르소나 하나만 생각한다. 아동/청소년/저연결 지역/치료 필요자는 고려하지 않는다.**

-----

## 3. 데모에서 보여준 핵심 3가지

해커톤 제출 영상에서 실제로 전달한 것:

### ① 조언하지 않고 감정을 받아주는 대화

- 사용자: "오늘 힘들었어."
- Minari: "…here." (not "Here's what you should do")

### ② 시간이 지나면 정이 드는 구조

- D+0 → D+7 변화: 말투, 기억, 일기, 단어 배움
- 피자 드롭 → "warm spotty circles." → 며칠 후 → "pizza?" → "yes" → "pizza-"
- 일기: "jy gave warm spotty circles. warm spotty circles has name now: pizza."

### ③ 3GB 모델에서 이만큼? (기술 충격)

- "my wifi is dead" → "What is wifi?" (기능이 아닌 존재의 본질로 오프라인을 보여줌)
- 아버지(63세)가 Minari에게 아내 이름(상남)을 지어줌 — Digital Equity 실증

-----

## 4. 절대 안 하는 것

- ❌ 조언/코칭/지시/진단 ("이렇게 해봐", "그건 우울증일 수 있어")
- ❌ 치료 언어 (therapy, treatment, cure, heal, fix, diagnose)
- ❌ 능동적 감정 탐색 ("혹시 화가 난 거야?")
- ❌ TTS (음성은 동물의 숲 웅얼웅얼만)
- ❌ 에이전트 기능 기본 ON (이메일 보내기, 일정 관리 등)
- ❌ 점수 파밍형 친밀도 (관계를 게임화하면 안 됨)
- ❌ "떠나려는 Minari" 드라마 (abandonment anxiety 유발)
- ❌ 커맨드창/단축키 대화 (사용자 주도 대화 시작은 직접 클릭만)
- ❌ 날씨 세분화 v1에서 (MVP 이후)
- ❌ 전설(legendary) 등급 선물 (v2 이후, 관계 기념물로만)
- ❌ 개인정보 과다 수집 (닉네임만. "뭐라고 부르면 돼?")
- ❌ 하드코딩 (pet_name/닉네임 동적 주입, 예시 동적 샘플링. 데모 = 실제 동작)

-----

## 5. 성공 기준

① "이건 일반 AI 챗봇이 아니네" (60초 안에)
② "대화가 조언형이 아니라 holding-space형이네"
③ "첫 세션 종료 후 '조금 정들었다'는 인상"

-----

## 6. 설계 원칙

### 기능과 감성의 관계

**기능은 감성 뒤에서 은은하게 받쳐준다.** 날씨 이벤트로 오늘 날씨를 "알려주는" 게 아니라, Minari가 우산을 들고 있는 것으로 "같이 사는" 느낌을 주는 것. 선물 시스템은 보상 메카닉이 아니라 "작은 일상의 교차점"처럼 느껴져야 한다.

### 아이디어 필터 3가지

1. **"생활의 증거"** — 이 기능이 Minari가 살아간 흔적을 남기나?
1. **"조용한 재등장"** — 이 기능이 나중에 은은하게 돌아올 수 있나?
1. **"말 없어도 관계가 되는가"** — 대화량 없이도 정을 쌓게 하나?

### 기능 판단 질문

"이게 더 **같이 사는 존재** 같게 하나, 아니면 그냥 기능을 하나 더 얹는 건가?"

-----

## 7. 해커톤 전략 (제출 완료)

### 모델: E2B 올인, llama.cpp 실행

- 기본 모델: **Gemma 4 E2B Q4_K_M** (under 3GB GGUF + mmproj 940MB)
- 런타임: **llama.cpp** (llama-server :8080, --reasoning off)
- E4B는 env 전환으로 유지 (상용화 시 성장 단계별 모델 스왑)
- 피치: **"A model under 3GB on llama.cpp that learns words, writes diary, never needs WiFi."**

### ⚠️ 하드코딩 금지 원칙

- 제출: working demo + **public code repo** + technical write-up + 데모 영상
- 심사: Vision + Technical Execution + Impact + **Reproducibility**
- 코드가 공개됨. 심사위원이 뜯어봄. "Not a fake UI. Not a mocked-up chatbot."
- 모든 데모 장면은 실제로 동작. 비전 결과 조작/가짜 반응 절대 불가.

### 3-트랙 전략

- **llama.cpp**: 트랙 어워드 타겟 ("resource-constrained hardware에서 가장 혁신적인 구현")
- **Digital Equity**: 장년층 + 낡은 하드웨어 + 오프라인
- **Health**: 정서적 웰빙

### 제출물

- **Kaggle**: https://www.kaggle.com/competitions/gemma-4-good-hackathon/writeups/minari
- **YouTube**: https://youtu.be/eBOPcwMSGX4
- **GitHub**: https://github.com/goofy1goober4/minari (public)

### 시연 영상 (제출 완료)

- 부제: **"A small roommate"**
- 원칙: 모든 장면 실제 동작, 자막 하드코딩 (SRT+ffmpeg+Pillow)
- 탄생: 씨앗 까딱→발아→눈 감은 채 등장→8초 깊은 호흡→눈뜨기→이름 되뇌기
- 단어 배움: 피자 그림 드롭 → "warm spotty circles." → "pizza?" → "yes" → "pizza-"
- 일기 엿보기: diary 포즈 클릭
- 오프라인: "my wifi is dead" → "What is wifi?"
- 아버지 장면: 63세 비기술 배경, 아내 이름(상남) 입력
- 쿠키 엔딩: 알람 → "...loud."

-----

## 8. 일정 (완료)

|주 |기간       |핵심                                  |상태|
|--|---------|------------------------------------|---|
|W1|4/17~4/23|맥미니 세팅 + MVP 뼈대                   |✅|
|W2|4/24~4/30|D+0 탄생 + snapshot + soft ping + 일기|✅|
|W3|5/1~5/7  |단어 배움 + 알람 연동 + 사운드               |✅|
|W4|5/8~5/11 |캐릭터 아트 + 스프라이트 시스템 + llama.cpp 전환 |✅|
|W5|5/12~5/18|UI 재설계 + 앉기 포즈 + 촬영 + 편집 + 제출  |✅|

4/16 첫 아이디어 → 5/18 Submit. 약 한 달. 비개발자가 AI 도구만으로.

-----

## 9. 진척도 스냅샷 (2026-05-19, 제출 완료)

|영역             |진척                                        |
|---------------|------------------------------------------|
|제품 정의 / 북극성    |100%                                      |
|시스템 설계         |100% (컨디션 시스템 설계 포함)                      |
|운영 세칙          |70% (boot/ping/snapshot 완료, 나머지 post-hackathon)|
|**실제 코드 구현**   |**100%** (73/73 회귀 + typecheck 통과)         |
|캐릭터 아트/모션/UI 자산|**100%** (idle + reading + diary 포즈)         |
|UI             |**100%** (Curious Prompt, ⏏ 메뉴, 영문화)       |
|데모 완성도         |**100%** (촬영 + 자막 + YouTube 업로드)           |
|write-up       |**100%** (v3 Kaggle 제출 완료)                  |
|**전체**         |**✅ 제출 완료**                                |

-----

## 10. 협업 구조

- **주용**: 기획, 제품 감각, 캐릭터 일관성 검수, 한국어 대사 원문 작성
- **Claude Max**: 큰 그림, 철학 일관성, 문서 관리, 설계서, 작업 분배, 촬영 감독
- **Claude Code**: 아키텍처 리뷰, 코드 구현, 맥미니에서 실행
- **GPT Pro (개인)**: 운영 세칙, 대사 디벨롭, toddler English 변환 (gpt_briefing 파일은 프로젝트에서 제거, 로컬 보관 중)
- **GitHub**: goofy1goober4/minari (**public**)

-----

## 11. 모델 전략

### 런타임: llama.cpp

|모델            |크기           |런타임          |비고             |
|--------------|-------------|-------------|---------------|
|**E2B Q4_K_M**|**under 3GB**|**llama.cpp**|**해커톤 기본 (올인)**|
|E4B Q4        |~9.6GB       |llama.cpp    |상용화 시 성장 단계별 스왑|

### E2B 올인 결정 근거

- E2B 비전 테스트 5/5 통과
- "정확하지 않은 게 오히려 Minari다움" — 피자를 "warm spotty circles"로 하는 게 캐릭터 완성도를 높임
- 다양성 93% (mode collapse 해결)
- 응답 ~180ms (텍스트) / ~1.2초 (비전, M4 Mac)
- 피치: **"This entire experience runs on a model under 3GB, on llama.cpp, completely offline."**

### 기술적 발견

- **--reasoning off 필수**: Gemma 4 기본 reasoning 끄지 않으면 7~9초. 끄면 ~180ms.
- **시스템 프롬프트 ~90단어**: 초기 50단어 하드 리밋설은 경험적으로 거짓. 66~76단어에서 빈 응답 0/20.
- **동적 예시 샘플링**: 고정 예시 → 모드 붕괴. pickN(3개)으로 해결 → 8/10 distinct.
- **클릭 트리거 = "."**: 마침표 하나가 최적. 입력 에코 없이 순수 fragment 출력.
- **뉴로사마 원칙**: 시스템 설계 ~70% + 모델 품질 ~30% = 체감 지능.

-----

## 12. 캐릭터 정체성

### 정의

**"귀엽고 이상하고, 생활 속에 스며들며, 있다가 없으면 묘하게 허전한 작은 동거 개체"**

### 레퍼런스 4축

- **요츠바** = 관찰 (세상을 처음 보는 눈)
- **논논비요리** = 템포 (느린 시간, 여백, 힘 빠진 느긋함)
- **치이카와** = 감정톤 (작고 귀여운데 힘든 날도 사는)
- **DORO (도로롱)** = 실루엣 (이상한 비율, 멍한 진심)

### 디자인 키워드

odd, dear, squished, low-energy creature, little roommate, weirdly lovable

### 외형 (확정, 아트 완성)

- 머리: 푸른 반사광이 있는 맑은 실버 (#DCE6EE 베이스)
- 눈: 아이스 아쿠아 블루
- 블라우스: 푸른기 도는 화이트, 둥근 칼라, 퍼프 반팔
- 원피스: 네이비~소프트 코발트 (서스펜더 형태)
- 배낭/구두: 채도 낮춘 쿨 브라운
- 양말: 화이트 레그워머
- 머리 위: 새싹 장식 (민트 #CFEFE1)
- 컬러 비율: 50/25/15/5/5 (머리·블라우스 / 원피스 / 브라운 / 포인트 / 혈색)

### 렌더링 (레이어드 스프라이트, 확정)

- body/face 2레이어, 턱 라인 컷 (1300x2000 투명 PNG)
- FACS AU 기반 표정 7종: open/closed/half/smile/surprise/tiltL/tiltR
- 코드 기반: 숨쉬기(scale ±0.5%, 5s cycle), 까딱(damped oscillation), 깜빡임, 풋 그림자
- 앉기 포즈 2종: reading(책 읽기), diary(일기 쓰기)
- Live2D: 파이프라인 검증 완료했으나 리깅 시간 부족으로 보류. 상용화 시 전환 (스프라이트→Live2D 파라미터 1:1 매핑 확인됨)

### 사운드

TTS 없음. 동물의 숲 NPC 웅얼웅얼. 실제 음성 샘플 15개. 닉네임 시드 피치, mood 변조. 물음표 끝음 상승. 탄생 시 이름 되뇌기 4비트. 한글 음소 매핑. ♪ 볼륨 조절 + 음소거 토글 구현.

### UX

- 풀스크린 투명 오버레이 모델
- 알파 기반 hit mask (body + sprout + face 합성)
- hover → CT OFF → long-press(0.5s)/drag. 투명 영역 click-through.
- Windows: 30ms 커서 폴링으로 CT 대체 (forward macOS 전용)
- Curious Prompt: Frutiger Aero, 독립 글래스 표면, 드래그 이동, 히스토리 패널
- ⏏ long-press 메뉴: ♪ 볼륨 / ⌽ 종료. 슬라이드+페이드 + 자동 닫기.
- 커스텀 커서: Minari 위에 마우스 올리면 미키마우스 손 모양

-----

## 13. 핵심 행동 원칙

### D+0 — 탄생 (최초 1회만)

- 설치 완료 → 씨앗 두 번 까딱 → 발아 → 새싹 유지 5초 → 눈 감은 채 등장 → 8초 깊은 호흡 → 눈뜨기
- "뭐라고 부르면 돼?" → 사용자 닉네임 설정 (비차단) → 이름 되뇌기 mumble → 옹알이 시작
- Minari의 이름은 사용자가 짓지 않음 — 호기심 단계에서 사용자가 물으면, Minari가 기억 속 단어를 골라 스스로 이름을 지음
- 전환 조건: `days_since_hatch === 0`
- D+0 중단 시: `birth_completed === false`이면 재실행 시 D+0 재시도

### D+1 이후 — "발견" 기반 부팅

- 앱 열면 Minari가 이미 뭔가 하고 있음 (책 읽기, 일기 쓰기, 졸기)
- snapshot 저장 → 경과 시간 계산 → 활동 선택 → 첫 프레임 즉시 렌더
- 전환 조건: `days_since_hatch >= 1` AND `birth_completed === true`

### 상호작용 3단 구조

**A. Ambient presence (80%)** — 말 없이 존재만 드러냄. 허용: blink, breathing, 시선 이동, 가방 뒤적임, 하품. 금지: 자동 말풍선, 과한 주의 끌기.

**B. Soft ping (15%)** — Minari가 먼저 짧게 말 건다. 1줄. 무시해도 어색하지 않음. 하루 2~5회, 최소 간격 30~90분. 종류: noticing("rain."), showing("look."), accidental("mm… bug."), overflow("ah— too excited."). 금지: 장문, 연속 발화, 답변 압박, guilt 유도.

**C. Full conversation (5%)** — 사용자가 Minari를 직접 롱프레스해서 시작. Curious Prompt UI 등장.

### 핵심 행동

- **Mimic**: 하루 2~3회, 딜레이, 우연처럼
- **배낭**: 자발적 사용 + mimic. 자기 맘대로 꺼내서 책 읽기, 삼각김밥 먹기
- **물꼬 대화**: 조용→쏟아짐→"미안 너무 신나서…" 사과
- **자기 루틴**: 고양이처럼 독립적 리듬
- **고유 버릇**: Minari마다 언어습관 2~3개 생성
- **첫인사/마지막인사 분리**, **빈자리 흔적**, **작은 전염** (말버릇 변형 하루 1회 이하)
- **일기 장기보관 필수**: TTL 무관, cold→archive로 요약 압축하되 삭제 안 함
- **일기 엿보기**: diary 포즈 클릭 시 일기 내용 열람 가능

### 안전선 (하드라인)

- 금지 언어: therapy, treatment, cure, heal, fix, diagnose
- 허용 언어: emotional wellbeing, companionship, presence, holding space
- 에이전트 기능 기본 OFF (사용자 명시 시만)
- 의존 방지 장치: 대화 쿨다운, 자발적 휴식("sleepy."), 성장 감속, "I'm not enough" 자인, 위기 시 캐릭터 브레이크
- 윤리 하드라인: 자해/자살/타인가해/미성년자 → 캐릭터 모드 즉시 중단

-----

## 14. 감정적 닻

> *"다들 혐오와 시기, 질투에 사는 세상. 좀 가슴 따뜻한 세상을 만들고 싶다.*
> *더 똑똑한 AI는 누구나 도전할 수 있지만, 따뜻한 테크놀로지는 아무나 구현하기 힘들다.*
> *나는 휴머니즘의 힘을 믿는다."*
> — 2026-04-17, 주용

-----

## 15. post-hackathon 방향

해커톤 결과 대기 중. 다음 단계:

- **OIRA / ADHD Agent OS** — Minari는 이 생태계의 한 조각
- **컨디션 시스템 + 퀄리아** — 감각-감정-시간 공명
- **이름 거부 기능** — "이름을 모르는 채로도 함께 있을 수 있다"
- **Live2D 재도입** — 비주얼 업그레이드
- **설계 문서 최신화** — 완료 (v0.7.0)
- **callOllama 리네임** — 코드 정리

-----

*"Minari doesn't solve your life. It holds space while you do."*
*"This entire experience runs on a model under 3GB, on llama.cpp, completely offline."*
