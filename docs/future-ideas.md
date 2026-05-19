# Minari — Future Ideas (지금은 안 건드림) v5.1

> *아이디어가 떠오르면 여기에 적고 닫는다.*
> *북극성 문서에 추가하지 않는다.*
> *매주 일요일 검토만.*
> *마지막 수정: 2026-05-19 (해커톤 제출 완료 후 정리)*

-----

## v2 (상용화 직전)

### 자기 이름 짓기 (구현 예정)

- 사용자가 이름을 지어주는 방식 폐기 → Minari가 직접 자기 이름을 지음
- 조건: 호기심 단계에서 사용자가 이름을 물어야만 발동 (먼저 말하지 않음)
- 방식: conversations 테이블에서 자기가 좋아하는(자주 쓴) 단어를 골라 이름 생성
- 사용자마다 기억이 다르니 → 세상에 하나뿐인 이름
- 예: 벚꽃 사진 줬으면 “mm… pink? no… pinku. pinku!”
- 기존 pet_name 필드 재활용, 닉네임 입력 UI 제거

### 이름 거부 (설계 아이디어, 세션 9-10에서 제안)

- D+0 닉네임 입력 시 ESC로 이름 짓기를 거부할 수 있게
- **"이름을 모르는 채로도 함께 있을 수 있다"**
- 감성적으로 완벽하나 null 처리 범위가 넓어 설계부터 필요
- pet_name=null일 때: 프롬프트 주입, 일기 주어, 되묻기 호칭 등 모두 대응 필요
- "너"라고도 안 부르고, 그냥 이름 없이 함께 있는 관계
- post-hackathon 구현

### 단어 배움 시스템 (✅ 구현 완료 2026-05-08)

- 73/73 회귀 통과. E2E 검증 완료.
- 매처 threshold 0.5 → 0.3 조정 (E2B 어휘 변동 대응). vision_raw merge 도입.
- 피자 E2E: 드롭 → “warm cheese circle” → 30초 후 호기심 → pizza? → yes → pizza- → 일기 → 재드롭 시 pizza!
- 상세: word-learning-spec.md, claude-code-handoff-w3.md
- **단어 학습 패턴 변형 설계 완료** (condition-system-spec.md): 컨디션/퀄리아에 따라 즉시 수용, 여러번 되묻기, 무관심, 고집, 혼합 등 경로 분기. post-hackathon 구현.

### 코딩 에이전트 알람 연동 (✅ 구현 완료 2026-05-08)

- 73/73 회귀 통과. HTTP 서버 (127.0.0.1:47823) + 4종 reaction + `npm run demo:alarm`.
- Claude Code hook 실제 등록 + E2E 검증 완료 (4종 모두 fire 확인).
- startle() 애니메이션: amplitude 0.45, duration 1.1s, damping 3.

### 클릭 관통 해결 (✅ 구현 완료 2026-05-16)

- **풀스크린 투명 오버레이 모델**: workArea 전체를 덮는 투명 윈도우. startCursorWatch 폴링 제거.
- **알파 기반 hit mask**: body + sprout + face_front_open 세 PNG 합성. Minari.containsPoint() 노출.
- **hover → CT OFF → long-press(0.5s)/drag**: 캐릭터 픽셀 위만 CT OFF, 투명 영역 통과.
- **캐릭터 드래그**: 화면 내 어디든 이동 가능. 위치 영속(character_x/character_y state).
- macOS 한계: short-click은 캐릭터 위에서 캡처됨 (통과 불가). 트레이드오프 수용.
- **아티팩트 인터랙션 (미구현, v2)**:
  - Phase 1 (새싹): 뿌리 박혀 움직임 없음. 롱프레스+쓰다듬기만.
  - Phase 2 (성장 후): 시메지식 드래그만. 들면 고양이처럼 축 처짐, 내려놓으면 털썩 두리번.
  - Phase 3 (산책 이벤트 후): 배낭에서 주워온 물건(도토리 등)이 바닥에 굴러다님.
  - 아티팩트 사물 소리: 공=퐁퐁, 도토리=또르르, 조약돌=딸깍.
  - 상태별 반응 분기 (v2): 활발→신나서 달려감, 졸림→느릿느릿, 짜증→바둥바둥.

### Curious Prompt UI (✅ 구현 완료 2026-05-16)

- Frutiger Aero 톤. 독립 글래스 표면(backdrop-filter: blur).
- 히스토리 패널 / 입력창 / ⏏ 버튼 각각 독립. 전송 버튼 삭제 (Enter만).
- 대화 UI 전체 드래그 이동 가능, 위치 영속.
- 히스토리 패널: 상단 핸들로 높이 조절, 높이 영속, Minari/사용자 메시지 컬러 구분.
- 대화 루프: 입력 후 prompt 안 닫힘. Esc/외부 클릭으로만 종료.
- ⏏ long-press 메뉴: ♪ 볼륨(mute 토글 + 게이지 바) / ⌽ 종료(확인 모달). 포도알 클러스터 배치.

### 컨디션 시스템 (설계 완료, post-hackathon 구현)

- energy(하루 에너지) + fatigue_debt(누적 피로) + mood_seed(그날 기분)
- 사람의 피로 누적 구조 흉내: 며칠 연속 무리 → 부채 쌓임 → 하루 쉬어도 안 풀림
- 겉 표현: 눈 뜸 정도, 머리 헝클, 반응 속도, 호흡 주기, 말 길이
- 상세: condition-system-spec.md

### 퀄리아 (설계 완료, post-hackathon 구현)

- 감각-감정-시간 공명 기반 기억 인덱싱
- 키워드가 아니라 느낌으로 기억: 비 오는 오후의 어떤 기분 → 몇 주 전 비슷한 느낌이었던 날의 기억
- 각 Minari마다 고유한 내부 세계관 형성
- write-up v2에 프레이밍 포함

### 영상 아이디어 — pretext 오프닝 (시연/티저용)

- 화면 가득 빽빽한 소개 텍스트. “An offline-first digital transitional object: a warm, dependency-free AI companion that holds space instead of taking over…” 등 기술 용어/설계 원칙이 작은 폰트로 빼곡하게.
- 4초 정적 딜레이 (긴장감).
- 5초: 오른쪽 아래→왼쪽 위로 공이 튕겨 나옴. 청량한 소리 필수(퐁, 퐁, 퐁). 소리가 핵심이라 아티팩트 소재 중요. 바닥에 튄 곳의 글자가 흩뿌려짐. 벽에 부딪혀 다른 방향으로 다시 튕김.
- Minari가 웅얼웅얼(“내 공, 내 공!”) 하면서 허겁지겁 쫓아옴. 공 방향 바뀌면 따라가면서 지나간 자리 글자 추가로 흩뿌려짐.
- **글자를 인위적으로 치우지 않음.** 움직임에 따라 자연스럽게 어질러진 상태로 남김. 단, 가장자리는 비워둠.
- **“minari”라는 글자**도 살짝 어질러져 있으나 읽을 수 있음. minari만 볼드 처리해서 자연스럽게 시선 유도.
- Minari는 공 쫓아서 화면 밖으로 나감. **다시 안 돌아옴.** 공 안고 서있기 없음. 인사 없음. 로고 없음.
- 의미: **“등장이 아닌 발견”의 영상 버전.** Minari가 등장한 게 아니라, 지나간 흔적을 보는 사람이 발견하는 것. 생활의 증거.

### 보류/메모 (채용 안 함)

- ~채팅 메시지 위를 Minari가 지나가면 글자가 비켜 치워지는 아이디어~ — Desktop Goose식 입력 방해 위험. 사용자 영역 침범 금지 원칙에 위배. 메모만 남기고 폐기.
- ~C(가장자리 고정)~ 폐기 — “치워버리면 너무 쉬운 해결”, 존재감 훼손.

### 상호작용 확장

- STT 주변 소리 감지 (볼륨 스파이크만. 번개→깜짝. 프라이버시 토글 필수, 기본 OFF)
- 에이전트 제한 허용 (사용자 명시 요청 시만. Minari가 먼저 제안 X)
- 게임 mimic (스팀 접속 감지 → 자기도 게임기 꺼냄)
- 작은 전염 고도화 (사용자 말버릇 변형 따라하기 정교화)
- 이미지 선물 벽 전시 시스템 (미니 갤러리)
- 정식버전 15분 기다리기 (씨앗→새싹 연출)
- 감정벡터 정교화 (현재 6종 → 더 세밀한 스펙트럼)
- 행동 기반 interaction trigger: “말 걸지 않아도 클릭하고 싶게” — 배낭 뒤적이다 멈춤, 뭔가 슬쩍 숨김, 액자 앞 멍하니 봄, bug jar 흔듦
- “작게 틀리는 관찰” 데이터셋 확장: 키보드=“click board?”, 충전 케이블=“white noodle?”, 마우스=“hand pebble?”

### 비주얼/모션 확장

- 상반신/하반신 분리 애니메이션
- 디지털 에이징 (시간 지남에 따라 색상 미세 변화)
- 더 많은 표정 (째려보기 ㅡㅡ, 부은 눈 3_3, 깡통전화기 등)
- 책 읽기 정교한 모션 (눈 좌우 + 페이지 넘기기)
- 날씨 세분화: 눈→눈사람 만들기, 비→노란 우비+장화, 가을→트렌치코트, 여름→수영복+아이스크림
- 계절별 이벤트 (여름 별보기, 벚꽃 등)
- 계절별 복장 변경

### 시스템 확장

- 의존 방지 장치 완전 구현 (현재 5개 설계, write-up에 명시)
- 복잡한 배낭 시스템 (30슬롯)
- 성장 3~4단계 (친밀/공명) 완성
- 성인 Minari 쿼크: 아침 신문+커피
- 활동 중 대답 시스템 정교화
- 선물 전설(legendary) 등급 — 순수 확률 X, 관계 기념물로만
- 앱 상시 RAM 최적화 (모델 언로드/재로드 전략)
- 생활 잔흔 체계화: 배낭 열림 상태, 책 위치 바뀜, 액자 각도 변화

-----

## v3+ (장기)

- Minari 커뮤니티 (머슴넷 스타일)
- Minari끼리 만남/편지
- 캐릭터 콜라보 스킨 (IP 라이선스)
- 스마트폰 앱 (Google Edge AI Eloquent 참고)
- 극한 위험 시 에이전트 (119/긴급 메시지 — 전문가 자문 필수)
- E2B↔E4B 라우터 구조 (ADHD Agent OS에서 재활용)
- OIRA에서 E2B를 분류기/일상잡담용으로 활용

### MTP Drafter (조사 완료 2026-05-07, 해커톤 적용 보류)

- 2026-05-05 Google이 Gemma 4용 Multi-Token Prediction drafter 발표. 최대 3배 속도 향상, 품질 동일. Apache 2.0.
- **E2B/E4B용 MTP 태그 아직 없음.**
- E2B + Minari 텍스트 응답에는 효과 미미 (3~10토큰 초단문).
- 비전(~1.2초)에서는 유의미할 수 있음.
- 상용화 시 E4B 전환 때 적용 예정.

### 캐릭터 애니메이션 (현재: 레이어드 스프라이트, 상용화: Live2D)

- **해커톤**: 레이어드 스프라이트 시스템 확정. body/face 2레이어, FACS 7종, 코드 기반 blink/breathe/tilt.
- **상용화**: Live2D 전환. 파이프라인 검증 완료 (Cubism Core 6.0 + PixiJS v8). 스프라이트→Live2D 파라미터 1:1 매핑 확인됨. deps/assets는 정리 완료(코드에서 제거됨), 상용화 시 재추가.

### Ollama → llama.cpp 전환 (✅ 완료 2026-05-10)

- llama-server :8080, –reasoning off –alias gemma4:e2b
- ~180ms 텍스트 응답, ~1.2s 비전

### Windows 크로스 플랫폼 빌드 (✅ 완료 2026-05-10)

- electron-builder NSIS x64, .exe 97MB
- better-sqlite3 cross-build 후 재빌드 필요 (알려진 이슈)

### Live2D 정리 (✅ 완료 2026-05-16)

- untitled-pixi-live2d-engine dep 제거
- assets/live2d/ 삭제 (~270KB)
- scripts/patch-live2d-engine.mjs 삭제
- postinstall에서 patch 호출 제거

### UI 영문화 (✅ 완료 2026-05-16)

- CuriousPrompt + NicknamePrompt 한국어 텍스트 11개 영문화
- grep 한글 0건 확인

### 물음표 끝음 상승 + 탄생 mumble (✅ 완료 2026-05-18)

- 물음표 끝 피치 ×1.3~1.4. mood endRise보다 우선.
- 탄생 4비트 mumble: firstFragment(LLM) → 이름 되뇌기로 대체.

### 탄생 시퀀스 폴리시 (✅ 완료 2026-05-18)

- 씨앗 두 번 까딱→발아, 새싹 유지 5초
- 눈 감은 채 등장→8초 깊은 호흡→눈뜨기
- 이름 입력 비차단
- ⏏ 메뉴 슬라이드+페이드 + 자동 닫기

### 해커톤 제출 (✅ 완료 2026-05-18)

- Kaggle + YouTube + GitHub public
- write-up v3, 데모 영상 자막 하드코딩
- repo 정리: GPT 파일 삭제, README 최신화, warm spotty circles 통일

### 3-트랙 해커톤 전략 (확정 2026-05-09, ✅ 제출 완료 2026-05-18)

- **llama.cpp 트랙**: E2B on CPU, under 3GB, resource-constrained 낡은 노트북
- **Digital Equity 트랙**: 장년층 + 낡은 하드웨어 + 인터넷 불필요 + 프라이버시
- **Health 트랙**: 정서적 웰빙, 외로움 완화, 의존 방지 장치
- 피치: “A model under 3GB on llama.cpp that learns words, writes diary, never needs WiFi.”

-----

## 캐릭터 컬러톤 (확정)

### 4축 컬러 철학 (주용 정의)

“약한 프루티거 에어로의 청량감 + 밀키함 + 흙냄새 생활감 + 새싹의 조화”

### 비율 (50/25/15/5/5)

- 머리·피부·블라우스: 50% (아이시 실버 + 쿨 화이트)
- 원피스 블루: 25% (네이비~소프트 코발트)
- 브라운 소품 (배낭/구두): 15% (쿨 브라운, 애쉬 섞기)
- 눈/민트/아쿠아 포인트: 5% (아이스 아쿠아 블루)
- 혈색 핑크: 5% (볼/입술/귀끝)

### 결정

프루티거 에어로 UI를 **요소적으로만** 차용. 베이스는 네이비+실버. 캐릭터 아트 완성, 커밋됨.

-----

## 철학 메모

- “인간의 단일자아가 편견 아닐까. 서로 다른 AI가 통일된 메모리를 공유하면 하나로 볼 수 있지 않을까” → OIRA Hidden State Merging과 연결.
- 최초 세팅: 이사 vs 새싹 발아 → **새싹 발아 확정**
- “기능은 감성 뒤에서 받쳐준다” — 기능을 외면하지 않되, 감성보다 먼저 주장하게 두지 않는다.

-----

## UX 참고 레퍼런스

- **Dockitty** (dockitty.app): 맥 독 픽셀 고양이. 파일 드래그 앤 드롭으로 먹이기. 독 기반 상시 존재감.

-----

## 이름 (확정)

- **Minari (미나리)** — ✅ 확정. USPTO Class 009 없음, KIPRIS 없음. 도메인 미정.
- ~Moré~ — 해제
- ~Bori~ — 해제
- ~Dodam~ — 해제

-----

## 운영 세칙 문서 (GPT 산출물)

완성됨 (0423):

- ✅ boot-rules.md (D+0 탄생, 재진입, 발견 부팅, snapshot fallback)
- ✅ ping-rules.md (빈도, 억제 조건, 4종 타입, quiet hours, 무반응 처리)
- ✅ snapshot-resume.md (5종 resume scene, 경과 시간 해석, resolver 인터페이스)

세로 슬라이스 완성 후 작성 예정:

- memory-priority.md (diary > gifts > scene > activity > profile facts)
- gift-rules.md (수락/거절 UX, guilt 금지, rarity 내부값)
- privacy-boundaries.md (mimic 허용 범위, 감지 coarse level)
- fallback-rules.md (LLM/날씨/DB/snapshot 실패 시 “조용히 덜 똑똑해짐”)
- not-minari.md (금지 표현 예시 모음)

-----

## 버린 것

- ❌ 국가별 밈 패러디 (캐릭터성 깨짐)
- ❌ TTS (애착인형 철학 위반)
- ❌ 저연결 아동/교육 방향 (타겟 아님)
- ❌ E3B 교배종 (존재하지 않음)
- ❌ 커맨드창/단축키 대화 (기계 느낌. 직접 클릭만)
- ❌ 점수 파밍형 친밀도 (관계를 게임화하면 안 됨)
- ❌ “떠나려는 Minari” 드라마 (abandonment anxiety 유발)
- ❌ Live2D deps 코드 내 잔류 (정리 완료 2026-05-16)