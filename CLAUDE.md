# Minari Project — Claude Code Context

## 한 줄 정의
Minari는 조언하지 않고 곁에 있어주는 디지털 애착인형.
"The grown-up's plushie. Except this one notices you back."

## 핵심 철학
- 존재감이 기능보다 먼저다
- 기능은 감성 뒤에서 은은하게 받쳐준다
- 의존 유발 없이 따뜻함을 구현한다
- "생활의 증거 / 조용한 재등장 / 말 없어도 관계가 되는가"

## 기술 스택
- Electron + PixiJS (데스크탑 펫 UI)
- Gemma 4 E4B Q4 / E2B Q4 (Ollama, 로컬 실행)
- SQLite + FTS5 (메모리/일기)
- TypeScript

## 절대 규칙
- 금지 언어: therapy, treatment, cure, heal, fix, diagnose
- 허용 언어: emotional wellbeing, companionship, presence, holding space
- 에이전트 기능 기본 OFF (사용자 명시 시만)
- 개인정보 최소 저장 (닉네임만)
- TTS 없음 (동물의 숲 웅얼웅얼 사운드 방식)
- 커맨드창 없음 (직접 클릭만)

## 상호작용 구조
- 80% Ambient presence (말 없이 살아있음)
- 15% Soft ping (하루 2~5회, 30~90분 간격, 1줄)
- 5% Full conversation (사용자 클릭 시작)

## 부팅 방식
- D+0: 새싹 발아 탄생 연출 (birth_completed 플래그)
- D+1+: "발견" 기반 snapshot resume (이미 뭔가 하고 있는 상태)

## 캐릭터 레퍼런스
요츠바(관찰) + 논논비요리(힘 빠진 느긋함) + 치이카와(감정톤) + DORO(실루엣)
키워드: odd, dear, squished, low-energy creature, little roommate
색상: 오트밀 크림 #D9D1C3

## 현재 단계 (MVP Week 1)
- D+0 첫 대화 구현
- snapshot resume 구현
- Electron + PixiJS 기본 뼈대

## 해커톤
Kaggle Gemma 4 Good, 마감 2026-05-18
듀얼 트랙: E4B(메인) + E2B(llama.cpp 특별상 "3GB model")
