# GNuvil 스마트미러 구현 명세

> - 파일명: `SMARTMIRROR_IMPLEMENTATION.md`
> - 상태: Draft v0.1
> - 대상: Codex / 구현 담당자
> - 상위 설계: `SMARTMIRROR_DESIGN.md`

> 현재 작업 결정(2026-09-26): Raspberry Pi 현장 환경 조사는 생략하고 데스크탑에서 개발한다. 배포 기준은 Raspberry Pi 3B와 최신 Raspberry Pi OS Desktop이다. 미확정 도보시간은 `null`로 두어 안내 문구를 표시하지 않는다.

> 후속 결정(2026-09-26): 장소는 한국외국어대학교 글로벌캠퍼스, 기준 정류장은 외국어대학교(29561) 외국어대학교기숙사 방면이다. `29561`은 승객용 정류소번호이며 GBIS `stationId`는 사용자 제공 API 테스트 응답으로 **228001371**을 확인했다. 버스는 1500-2번 양방향을 포함해 GBIS가 해당 정류장에 반환하는 모든 노선을 표시한다. 아래의 노선 1~5개 필터 예시는 이 결정으로 대체한다. 실제 응답에 없는 방향은 표시하지 않는다.

> 학식 데이터 출처 결정(2026-09-26): 사용자가 지정한 한국외대 글로벌캠퍼스 식당 페이지의 내부 HTML 식단 조회 요청을 사용한다. 한그릇, 외대한상, HufsDorm 세 식당을 모두 조회한다.

---

# 1. 구현 원칙

이 문서는 구현자가 임의로 구조를 결정하지 않도록 주요 인터페이스와 파일 구조를 정의한다.

## 반드시 지킬 원칙

1. MagicMirror² core는 직접 수정하지 않는다.
2. 기본 기능은 가능한 한 기본 모듈을 사용한다.
3. GNuvil 전용 기능은 `modules/` 아래의 커스텀 모듈로 구현한다.
4. API 키, 토큰, 비밀번호를 프론트엔드 코드나 Git 저장소에 저장하지 않는다.
5. 외부 API 호출은 원칙적으로 `node_helper.js`에서 수행한다.
6. frontend 모듈은 외부 API 원본 구조를 직접 해석하지 않는다.
7. `node_helper.js`가 외부 데이터를 내부 공통 데이터 모델로 정규화한 뒤 frontend로 전달한다.
8. 네트워크 장애나 API 오류가 발생해도 MagicMirror 전체가 중단되지 않아야 한다.
9. 미정 값은 추측하지 않는다.
10. 한 번에 전체 기능을 구현하지 말고 Phase 단위로 진행하고 테스트한다.

---

# 2. 목표 저장소 구조

예상 구조:

```text
MagicMirror/
├── config/
│   └── config.js
│
├── css/
│   └── custom.css
│
├── modules/
│   ├── MMM-GnuvilBus/
│   │   ├── MMM-GnuvilBus.js
│   │   ├── node_helper.js
│   │   ├── MMM-GnuvilBus.css
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── MMM-GnuvilCafeteria/
│   │   ├── MMM-GnuvilCafeteria.js
│   │   ├── node_helper.js
│   │   ├── MMM-GnuvilCafeteria.css
│   │   └── README.md
│   │
│   ├── MMM-GnuvilAirQuality/
│   │   ├── MMM-GnuvilAirQuality.js
│   │   ├── node_helper.js
│   │   └── MMM-GnuvilAirQuality.css
│   │
│   └── MMM-GnuvilNowPlaying/
│       ├── MMM-GnuvilNowPlaying.js
│       ├── node_helper.js
│       ├── MMM-GnuvilNowPlaying.css
│       └── README.md
│
├── docs/
│   ├── SMARTMIRROR_DESIGN.md
│   └── SMARTMIRROR_IMPLEMENTATION.md
│
└── .gitignore
```

초기 Phase에서는 모든 모듈 폴더를 미리 만들 필요는 없다.

구현 순서대로 추가한다.

---

# 3. MagicMirror² 모듈 기본 구조

커스텀 모듈의 frontend는 다음 패턴을 따른다.

```js
Module.register("MMM-GnuvilExample", {
  defaults: {
    updateInterval: 30000
  },

  start() {
    // local state 초기화
  },

  getStyles() {
    return ["MMM-GnuvilExample.css"];
  },

  getDom() {
    // 현재 state를 기반으로 DOM 생성
  },

  socketNotificationReceived(notification, payload) {
    // node_helper.js에서 전달된 데이터 처리
  }
});
```

backend helper는 다음 구조를 따른다.

```js
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    // helper state 초기화
  },

  socketNotificationReceived(notification, payload) {
    // frontend 요청 처리
  }
});
```

frontend ↔ backend 통신은 `sendSocketNotification()`을 사용한다.

---

# 4. 전체 config.js 방향

최종 `config.js`는 대략 다음 구조를 목표로 한다.

실제 정류장 ID, 좌표, 식당 정보 등은 확정 전까지 placeholder를 사용한다.

```js
const config = {
  language: "ko",
  timeFormat: 24,
  units: "metric",

  modules: [
    {
      module: "clock",
      position: "top_left",
      config: {
        timeFormat: 24,
        displaySeconds: false
      }
    },

    {
      module: "MMM-GnuvilBus",
      position: "top_right",
      config: {
        stationId: "REQUIRED",
        routes: [],
        walkMinutes: null,
        updateInterval: 30000,
        staleAfter: 300000
      }
    },

    {
      module: "weather",
      position: "bottom_left",
      config: {
        weatherProvider: "openmeteo",
        type: "current",
        lat: 0,
        lon: 0
      }
    },

    {
      module: "MMM-GnuvilCafeteria",
      position: "bottom_right",
      config: {}
    },

    {
      module: "MMM-GnuvilNowPlaying",
      position: "bottom_bar",
      config: {}
    }
  ]
};

module.exports = config;
```

`stationId`, 좌표 등 실제 값이 정해지기 전에는 Codex가 임의 값을 생성하지 않는다.

---

# 5. MMM-GnuvilBus 구현 명세

## 5.1 역할

경기버스정보(GBIS)에서 특정 정류장의 실시간 버스 도착정보를 조회하고, 설정된 노선만 화면에 표시한다.

---

## 5.2 데이터 흐름

```text
MMM-GnuvilBus.js
      │
      │ BUS_CONFIG
      ▼
node_helper.js
      │
      │ HTTP
      ▼
GBIS API
      │
      │ JSON/XML
      ▼
node_helper.js
      │
      │ normalize
      ▼
내부 BusData
      │
      │ BUS_DATA
      ▼
MMM-GnuvilBus.js
      │
      ▼
DOM
```

---

## 5.3 Socket Notification 이름

다음 이름을 사용한다.

### frontend → helper

```text
BUS_CONFIG
BUS_REFRESH
```

### helper → frontend

```text
BUS_DATA
BUS_ERROR
```

필요하지 않은 notification 이름은 임의로 추가하지 않는다.

---

## 5.4 config 인터페이스

```js
{
  stationId: string,
  routes: [
    {
      routeId?: string,
      routeName: string
    }
  ],

  walkMinutes: number,
  updateInterval: number,
  staleAfter: number
}
```

### 기본값

```js
{
  stationId: null,
  routes: [],
  walkMinutes: null,
  updateInterval: 30000,
  staleAfter: 300000
}
```

`stationId`가 없으면 API 호출을 시작하지 않고 명확한 오류를 로그에 기록한다.

---

# 6. 버스 내부 데이터 모델

frontend는 GBIS 원본 응답을 직접 사용하지 않는다.

`node_helper.js`에서 다음 포맷으로 정규화한다.

```js
{
  updatedAt: 1790413200000,
  stale: false,

  routes: [
    {
      routeId: "123456",
      routeName: "1117",

      first: {
        minutes: 6,
        seconds: 360,
        stopsAway: 3
      },

      second: {
        minutes: 19,
        seconds: 1140,
        stopsAway: 8
      }
    }
  ]
}
```

값이 없는 항목은 임의의 숫자로 대체하지 않는다.

예:

```js
first: null
```

---

# 7. GBIS 호출 정책

## 7.1 원칙

노선별로 개별 API 요청을 반복하지 않는다.

가능하면 다음 방식으로 구현한다.

```text
정류장 전체 도착정보 1회 조회
        ↓
전체 노선 목록
        ↓
config.routes에 지정된 노선만 필터링
```

설정한 노선이 5개여도 주기당 API 요청은 가능한 한 1회로 유지한다.

---

## 7.2 갱신 주기

기본:

```text
30초
```

즉:

```js
updateInterval: 30000
```

API 호출이 진행 중이면 동일 갱신 요청을 중복 실행하지 않는다.

---

## 7.3 API 키

다음처럼 코드에 넣지 않는다.

```js
const apiKey = "1234...";
```

다음 환경 변수를 사용한다.

```text
GBIS_API_KEY
```

backend에서:

```js
const apiKey = process.env.GBIS_API_KEY;
```

형태로 읽는다.

API 키가 없으면 API 호출을 하지 않고 명확한 오류를 출력한다.

---

# 8. 버스 오류 / 캐시 정책

## 정상

```text
API 성공
→ 데이터 normalize
→ updatedAt 갱신
→ stale=false
→ frontend에 BUS_DATA
```

## 일시적 API 실패

```text
기존 데이터 있음
→ 기존 데이터 유지
→ stale 여부 재계산
→ BUS_ERROR 또는 상태 업데이트
```

## 한 번도 정상 데이터를 받지 못함

화면:

```text
버스 정보를 불러올 수 없습니다
```

## 마지막 성공 이후 staleAfter 초과

기본 `staleAfter`:

```text
5분
```

화면:

```text
버스 정보 업데이트 지연
```

마지막 값은 표시해도 되지만 stale 상태임을 반드시 시각적으로 구분한다.

---

# 9. 버스 표시 정책

정상 예:

```text
1117     6분 · 19분
1150     9분 · 27분
1303    14분 · 36분
```

도착 예정 정보가 없는 노선은 표시하지 않는다.

두 번째 버스만 없을 경우:

```text
1117     6분
```

초 단위 카운트다운은 기본 UI에 표시하지 않는다.

---

# 10. 도보시간 보조 문구

`walkMinutes`를 사용해 참고 문구를 만들 수 있다.

예시 정책:

```text
arrivalMinutes <= walkMinutes
→ "서둘러 출발"

arrivalMinutes <= walkMinutes + 3
→ "지금 출발"

그 외
→ 별도 문구 없음
```

이 로직은 설정이나 CSS로 쉽게 제거할 수 있게 구현한다.

버스 도착 예측값의 정확성을 보장하는 표현을 사용하지 않는다.

---

# 11. Clock 구현

별도 모듈을 개발하지 않는다.

MagicMirror² 기본 `clock` 모듈을 사용한다.

시각적 변경은:

```text
css/custom.css
```

에서 처리한다.

목표:

- 24시간제
- 초 숨김
- 큰 시 / 분
- 날짜는 보조 크기
- 시계 영역은 화면 최우선

MagicMirror core CSS 파일은 수정하지 않는다.

---

# 12. Weather 구현

초기에는 기본 `weather` 모듈을 사용한다.

가능하면 API 키가 불필요한 provider를 사용한다.

표시 항목은 최소화한다.

- 현재 기온
- 현재 날씨 상태
- 필요 시 최고 / 최저

복잡한 3일 예보는 초기 구현 범위에서 제외한다.

---

# 13. Air Quality 구현

초기 필수 기능은 아니다.

필요할 경우:

```text
MMM-GnuvilAirQuality
```

를 만든다.

frontend/backend 구조는 버스 모듈과 동일한 패턴을 따른다.

출력은 복잡한 수치보다 다음과 같은 요약을 우선한다.

```text
미세먼지 보통
```

선택적으로 PM2.5 수치를 같이 표시한다.

---

# 14. Cafeteria 구현

## 현재 상태

사용자가 지정한 [한국외대 글로벌캠퍼스 식당 페이지](https://www.hufs.ac.kr/hufs/11319/subview.do)를 사용한다. 세 식당의 내부 HTML 식단 조회 요청을 서버에서 호출해 오늘 메뉴를 정규화한다. 공개 문서화된 JSON API는 확인되지 않았다.

확정 후 예상 구조:

```text
식단 데이터 소스
      ↓
node_helper.js
      ↓
normalize
      ↓
CAFETERIA_DATA
      ↓
MMM-GnuvilCafeteria.js
```

권장 내부 데이터 모델:

```js
{
  date: "2026-09-26",
  mealType: "lunch",
  cafeteria: "학생식당",

  menu: [
    "제육볶음",
    "계란찜",
    "미역국",
    "김치"
  ]
}
```

---

# 15. Now Playing 구현

## 목표

동아리방 메인 PC에서 음악이 실제 재생 중일 때 곡 정보를 표시하고, 그 외에는 대기 문구를 표시한다.

MagicMirror가 메인 PC에 직접 원격 shell 명령을 실행하도록 구현하지 않는다.

권장 구조:

```text
메인 PC
  ↓
MPRIS / playerctl
  ↓
작은 HTTP API
  ↓
MMM-GnuvilNowPlaying node_helper
  ↓
NOW_PLAYING_DATA
  ↓
frontend
```

내부 데이터 모델 예:

```js
{
  playing: true,
  title: "Ditto",
  artist: "NewJeans",
  album: "...",
  position: 134,
  duration: 185
}
```

재생 중이 아니면:

```js
{
  playing: false
}
```

frontend는 화면 아래쪽 중앙에 `현재 재생 중인 음악이 없습니다`를 표시한다.

---

# 16. CSS 원칙

모든 GNuvil 전용 스타일 변경은 가능하면 다음에서 처리한다.

```text
css/custom.css
```

또는 해당 모듈의 CSS:

```text
modules/MMM-GnuvilBus/MMM-GnuvilBus.css
```

원칙:

- MagicMirror core CSS 수정 금지
- 검은 배경 기반
- 높은 가독성
- 시계가 가장 큼
- 버스가 두 번째로 큼
- 날씨 / 학식은 보조 크기
- Now Playing은 가장 낮은 시각적 우선순위
- 지나친 카드 UI / 테두리 남발 금지
- 충분한 여백 유지

---

# 17. 환경변수 / 비밀정보

예상 환경변수:

```text
GBIS_API_KEY=
```

향후 필요 시:

```text
CAFETERIA_API_KEY=
NOW_PLAYING_ENDPOINT=
```

`.gitignore`에 실제 secret 파일을 추가한다.

예:

```gitignore
.env
.env.*
config/private.js
*.secret
```

단, 샘플 설정은 별도로 둘 수 있다.

```text
.env.example
```

샘플에는 실제 키를 넣지 않는다.

---

# 18. 자동 실행

새 환경에서는 우선 systemd 직접 실행을 고려한다.

예상 구조:

```text
graphical session
      ↓
systemd user service
      ↓
MagicMirror
```

정확한 unit 파일은 실제 Raspberry Pi OS와 MagicMirror 설치 경로를 확인한 뒤 작성한다.

Codex가 경로를 추측해서 고정하지 않는다.

기존 PM2 구조를 유지하는 경우에는 다음을 문서화한다.

- process 이름
- 시작 script
- `pm2 save`
- `pm2 resurrect`
- systemd startup unit

---

# 19. 로그

각 커스텀 모듈은 의미 있는 오류 메시지를 남긴다.

좋은 예:

```text
[MMM-GnuvilBus] GBIS_API_KEY is missing
[MMM-GnuvilBus] stationId is not configured
[MMM-GnuvilBus] GBIS request failed: HTTP 500
```

나쁜 예:

```text
error
failed
undefined
```

API 키 전체 값이나 민감정보를 로그에 출력하지 않는다.

---

# 20. Phase별 구현 지시

## Phase 0 — 환경 조사

코드를 대규모로 수정하지 않는다.

확인:

- Raspberry Pi 모델
- OS / architecture
- Node 버전
- MagicMirror 버전
- 실제 모니터 해상도
- 설치 경로
- 현재 자동실행 방식

결과를 `docs/ENVIRONMENT.md`에 정리한다.

---

## Phase 1 — 기본 화면

구현:

- 최신 MagicMirror 정상 실행
- `clock`
- 기본 `weather`
- `custom.css`

완료 조건:

- MagicMirror 시작 오류 없음
- 시계가 크게 보임
- 초가 표시되지 않음
- 화면 해상도에 맞게 레이아웃이 깨지지 않음

---

## Phase 2 — MMM-GnuvilBus

구현:

- 모듈 scaffold
- `BUS_CONFIG`
- GBIS API 호출
- normalize
- `BUS_DATA`
- 렌더링
- 30초 갱신
- stale 처리

완료 조건:

- 모듈 로드 오류 없음
- 잘못된 설정에서 전체 MagicMirror가 죽지 않음
- API 키가 frontend로 전달되지 않음
- 정류장 전체 도착정보를 주기당 1회 요청
- 설정된 노선만 표시
- 1차 / 2차 도착정보 표시
- API 실패 시 기존 정상 데이터 유지
- 5분 이상 미갱신 시 stale 표시
- 네트워크 복구 후 자동 정상화

---

## Phase 3 — Air Quality

필요성이 확인되었을 때만 수행한다.

---

## Phase 4 — Cafeteria

한그릇, 외대한상, HufsDorm 세 식당을 모두 조회한다. 메뉴가 없는 날에는 식당별로 빈 상태를 표시한다.

---

## Phase 5 — Now Playing

Linux 메인 PC의 MPRIS / `playerctl`을 읽는 HTTP API와 MagicMirror 모듈을 구현했다. API는 `GET /now-playing`으로 재생 상태, 곡명, 아티스트, 앨범, 진행 시간, 길이, 사용 가능한 앨범아트를 전달한다. 연결 주소와 토큰은 실행 환경에서 지정한다. 실제 메인 PC 환경에서의 연동은 배포 시 확인한다.

---

## Phase 6 — Autostart / 운영

- 자동실행
- 로그
- 재시작
- 네트워크 장애 복구
- 장시간 구동 테스트

---

# 21. 테스트 전략

최소한 다음 상황을 테스트한다.

## Bus

- 정상 API 응답
- 빈 응답
- 존재하지 않는 route
- stationId 누락
- API 키 누락
- HTTP 오류
- JSON 파싱 오류
- 네트워크 timeout
- 이전 정상 데이터 존재 + API 실패
- 5분 이상 API 실패
- 네트워크 복구

## Frontend

- 데이터 0개
- 노선 1개
- 노선 5개
- 첫 번째 버스 없음
- 두 번째 버스 없음
- 긴 노선 이름
- stale 상태

## 전체 화면

- 1280×1024 또는 실제 해상도에서 overflow 없는지
- 모듈이 숨겨질 때 이상한 빈 박스가 남지 않는지
- Now Playing이 곡 정보와 대기 문구 사이에서 전환될 때 layout이 깨지지 않는지

---

# 22. Codex 작업 규칙

Codex는 다음 규칙을 따른다.

1. 작업 전 `SMARTMIRROR_DESIGN.md`와 이 문서를 읽는다.
2. 한 번에 한 Phase만 구현한다.
3. 구현 전 현재 repository 상태를 먼저 확인한다.
4. 기존 파일을 필요 이상으로 재작성하지 않는다.
5. MagicMirror core를 수정하지 않는다.
6. 미정 값을 임의로 생성하지 않는다.
7. 실제 API 키를 코드에 넣지 않는다.
8. 새로운 dependency를 추가할 때 이유를 기록한다.
9. Phase 완료 후 테스트를 수행한다.
10. 테스트하지 못한 항목은 테스트했다고 주장하지 않는다.
11. 작업 종료 시 다음 내용을 요약한다.
   - 변경 파일
   - 구현 내용
   - 테스트 결과
   - 남은 TODO
   - 사람이 제공해야 할 값

---

# 23. Codex에 처음 전달할 권장 프롬프트

```text
먼저 docs/SMARTMIRROR_DESIGN.md와
docs/SMARTMIRROR_IMPLEMENTATION.md를 모두 읽어라.

현재 repository와 실행 환경을 확인하고,
문서의 Phase 0만 수행해라.

아직 구현을 시작하지 말고 다음을 조사하여
docs/ENVIRONMENT.md에 정리해라.

- Raspberry Pi / architecture
- OS 버전
- Node.js 버전
- MagicMirror 버전
- MagicMirror 설치 위치
- 현재 config
- 화면 해상도 관련 설정
- 자동실행 방식
- 기존 커스텀 모듈

확인할 수 없는 값은 추측하지 말고 TODO로 남겨라.
기존 secret이나 API key 값은 출력하거나 문서에 복사하지 마라.
```

Phase 0 확인 후 Phase 1을 별도 요청한다.

---

# 24. Phase 1 권장 프롬프트

```text
SMARTMIRROR_DESIGN.md와 SMARTMIRROR_IMPLEMENTATION.md를 따른다.

Phase 1만 구현해라.

목표:
- MagicMirror 기본 실행
- clock
- 최소 weather
- custom.css 기반 레이아웃

시계가 화면에서 가장 높은 우선순위를 갖도록 구성한다.
MagicMirror core 파일은 수정하지 마라.

구현 후 실제로 가능한 범위의 검증을 수행하고,
변경 파일과 테스트 결과를 보고해라.
Phase 2 버스 모듈은 아직 구현하지 마라.
```

---

# 25. Phase 2 권장 프롬프트

```text
SMARTMIRROR_DESIGN.md와 SMARTMIRROR_IMPLEMENTATION.md를 따른다.

Phase 2인 MMM-GnuvilBus만 구현해라.

GBIS 관련 stationId, 표시 노선, API key가 실제로 제공되지 않은 경우
추측하지 말고 설정 placeholder와 명확한 validation만 구현해라.

요구사항:
- node_helper에서 API 호출
- frontend에 API key 노출 금지
- BUS_CONFIG / BUS_DATA / BUS_ERROR 사용
- 정류장 전체 도착정보를 1회 조회 후 노선 필터링
- 30초 갱신
- 중복 요청 방지
- 내부 정규화 데이터 모델 사용
- 마지막 정상 데이터 캐시
- 5분 stale 처리
- 오류 발생 시 전체 MagicMirror가 중단되지 않음

구현 후 단위 테스트 또는 가능한 mock 테스트를 수행해라.
실제 GBIS 호출은 키와 실제 stationId가 있을 때만 수행해라.
```

---

# 26. 완료의 정의

코드를 작성했다는 이유만으로 Phase가 완료된 것으로 보지 않는다.

각 Phase의 다음 항목이 충족되어야 한다.

```text
구현
+
실행/검증
+
오류 처리
+
문서 반영
+
남은 TODO 명시
```

실제 하드웨어나 API key가 없어 테스트하지 못한 항목은 반드시 미검증 상태로 남긴다.
