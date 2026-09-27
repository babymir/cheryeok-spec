# 체력스펙 — 채용 체력인증 준비 서비스

국민체력100 인증서를 요구하는 채용(청원경찰·환경공무관·공무직·승무원 등) 지원자가
센터 측정 전에 **합격 가능성(집에서 두 항목만 재도 됨), 모자란 항목, 공고별 인증서 조건, 마감일에 맞춘 측정 일정**을 확인하는 웹 서비스.
채용 담당자용으로 **요구 등급별 연령·성별 통과율, 예상 지원자 중 남는 인원, 공고문 안내 문구**도 제공한다.

## 폴더 구조
```
service/
├── index.html            화면 뼈대
├── css/style.css         디자인 (색은 맨 위 변수에서 바꾼다)
├── js/
│   ├── grade.js          ★ 등급 계산 엔진 (고시 제2025-0027호 규칙) — 브라우저·Node 공용
│   ├── quick.js          ★ 간이 진단 (조건별 실제 통과율표 조회, 동년배 백분위) — 브라우저·Node 공용
│   ├── jobs.js           공고 접수 상태·"내 인증서로 지원 가능한가" 판정 + 채용공고 탭 화면
│   ├── schedule.js       마감일 역산 예약 일정
│   ├── fields.js         입력 항목 정의, 영상 매칭 규칙, 예시 값
│   ├── dom.js            안전한 화면 요소 생성 도우미
│   ├── app.js            첫 화면·지원자 화면·탭 전환
│   └── employer.js       채용 담당자(통과율·예상 인원·공고 문구)·데이터 출처 화면
├── data/                 화면이 읽는 데이터 (배포 대상)
│   ├── criteria.json     등급 기준값 (공식 인증기준 페이지에서 추출)
│   ├── jobs.json         채용공고 정리 (직접 확인한 것만)
│   ├── videos.json       운동처방 영상 (동영상 API)
│   ├── centers.json      인증센터·달별 혼잡도 (측정건수 API)
│   ├── stats.json        통과율·탈락 이유 (측정결과 API)
│   ├── quick.json        간이 진단 통과율표·백분위·아깝게 떨어진 사람 (측정결과 API)
│   └── validation.json   엔진 검증 결과
├── scripts/              데이터 만드는 스크립트 (배포 안 함)
├── .env                  data.go.kr 인증키 (절대 공개 금지, git 제외)
├── raw/, data_work/      API 원본 저장소 (git 제외)
```

## 데이터 다시 만들기 (순서대로)
```bash
cd service   # 이 저장소 폴더로 이동
python3 scripts/build_criteria.py          # 등급 기준값
python3 scripts/collect_videos_centers.py  # 영상·센터 (1분)
python3 scripts/collect_measurements.py    # 측정결과 약 29만 건 (1시간 안팎, 중단돼도 이어받기)
node scripts/validate_engine.js            # 엔진 검증 → 일치율 출력
node scripts/build_stats.js                # 통과율 통계
node scripts/build_quick.js                # 간이 진단표 + 검증(적중률 출력)
node scripts/test_logic.js                 # 핵심 계산 테스트 → "테스트 N개 통과"
```
CSS·JS 를 고치면 `index.html` 의 `?v=` 값을 바꿔야 방문자 브라우저가 새 파일을 받는다.

## 내 컴퓨터에서 보기
```bash
cd service   # 이 저장소 폴더로 이동
python3 -m http.server 8765
# 브라우저에서 http://localhost:8765 열기
```
(파일을 더블클릭해서 열면 데이터가 안 불러와진다. 반드시 위 명령으로 연다.)

## 확인 포인트
- 합격 진단 탭 → "예시 값 넣기" → 3등급 가능성 0%, "윗몸일으키기 38회(4회 더)까지 올리면 0% → 89%"가 나오면 정상
- 합격 진단 탭 → '전체 기록 입력' → "예시 값 넣기" → 예상 4등급, 근지구력 4회 부족
- 채용 담당자 탭 → 3등급 이상 전체 통과율 52.2%
- 데이터 출처 탭 → 등급 일치율 성인 99.99%, 간이 진단 3등급 적중 90.0%
