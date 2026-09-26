# Gnuvil 스마트미러

Gnuvil 동아리방용 MagicMirror² 설정과 전용 모듈을 관리하는 저장소입니다. MagicMirror² 본체는 별도로 설치하며, 본체 소스는 수정하지 않습니다.

## 빠른 사용법

1. MagicMirror²와 Node.js 24를 설치합니다. 아래 [설치 및 실행](#설치-및-실행)에 적힌 대로 이 저장소의 `config/config.js`, `css/custom.css`, 세 개의 전용 모듈 폴더를 MagicMirror 설치 폴더의 같은 위치에 복사합니다.
2. MagicMirror를 실행할 터미널에서 버스 API 키를 설정합니다. 키는 파일에 적지 않습니다.
3. MagicMirror 설치 폴더에서 설정을 검사하고 서버를 시작합니다.

```powershell
# Windows PowerShell
$env:GBIS_API_KEY = '<발급받은 키>'
cd '<MagicMirror 설치 폴더>'
node js/check_config.js
node serveronly/index.js
```

브라우저에서 [http://localhost:8080](http://localhost:8080)을 열면 됩니다. 서버를 끌 때는 터미널에서 `Ctrl+C`를 누릅니다. Raspberry Pi에서는 같은 파일을 복사하고 `GBIS_API_KEY`를 설정한 뒤 MagicMirror 설치 폴더에서 `node --run start`를 실행합니다. 음악 정보까지 표시하려면 [음악 재생 정보 설정](#음악-재생-정보-설정)을 따릅니다.

화면에는 왼쪽 위 시계, 오른쪽 위 버스 도착정보, 왼쪽 아래 날씨, 오른쪽 아래 학식, 하단 음악 정보가 표시됩니다. 버스는 도착이 가까운 순서로 보여줍니다.

## 개발 및 배포 기준

- 개발: 데스크탑에서 작성하고 검증한 뒤 Git으로 Raspberry Pi에 전달
- 배포: Raspberry Pi 3 Model B, 최신 Raspberry Pi OS 64-bit Desktop
- 현재 범위: Phase 1 기본 화면, Phase 2 버스 모듈, Phase 4 학식 모듈, Phase 5 Now Playing 모듈
- 데스크탑 검증 기준: MagicMirror² v2.37.0, Node.js v24.21.0
- 상위 요구사항: [설계 문서](SMARTMIRROR_DESIGN.md), [구현 명세](SMARTMIRROR_IMPLEMENTATION.md)

Raspberry Pi 현장 환경 조사는 생략합니다. 설치 경로와 실제 디스플레이 해상도는 배포 시 확인합니다.

## 설치 및 실행

1. [공식 설치 안내](https://docs.magicmirror.builders/getting-started/installation.html)에 따라 MagicMirror²를 별도 디렉터리에 설치합니다. 검증에 사용한 버전은 v2.37.0이며 Node.js 24를 사용했습니다. 데스크탑과 Raspberry Pi에서 같은 MagicMirror² 릴리스를 사용합니다.
2. 이 저장소의 `config/config.js`를 MagicMirror 설치 디렉터리의 `config/config.js`로, `css/custom.css`를 `css/custom.css`로, `modules/MMM-GnuvilBus`, `modules/MMM-GnuvilCafeteria`, `modules/MMM-GnuvilNowPlaying`을 각각 같은 이름의 모듈 디렉터리로 복사합니다.
3. MagicMirror 설치 디렉터리에서 `node --run config:check`를 실행한 뒤 화면을 시작합니다. Windows에서는 `node --run start:windows`, Raspberry Pi에서는 `node --run start`를 사용합니다.

날씨는 한국외국어대학교 글로벌캠퍼스의 [대략적인 중심 좌표](https://mapcarta.com/W231591705)(37.33664, 127.26608)를 기본값으로 사용합니다. 동아리방의 정확한 좌표를 쓰려면 시작 전에 환경 변수로 덮어씁니다.

```text
GNUVIL_WEATHER_LAT=<실제 위도>
GNUVIL_WEATHER_LON=<실제 경도>
```

기본 `weather` 모듈은 Open-Meteo의 현재 날씨를 표시합니다. 환경 변수가 없으면 캠퍼스 좌표를 사용하며, 지정한 값이 잘못되면 날씨 영역은 생성되지 않습니다. 이 설정에는 API 키가 필요하지 않습니다.

## 버스 설정

기준 정류장은 **외국어대학교(29561), 외국어대학교기숙사 방면**으로 설정했습니다. `29561`은 승객용 정류소번호이고, 도착정보 API의 `stationId`는 **228001371**입니다. 이 값은 사용자가 [GBIS 정류소명/번호 목록조회](https://www.gbis.go.kr/gbis2014/publicService.action?cmd=mBusStation) 테스트에서 확인했습니다. `routes: null`은 이 정류장의 도착정보에 포함된 모든 노선을 표시합니다. 같은 번호의 양방향이 별도 항목으로 반환되면 행선지를 함께 표시합니다. 자세한 내용은 [버스 모듈 문서](modules/MMM-GnuvilBus/README.md)를 참고하세요.

버스 도착정보는 2분마다 조회합니다. 개발계정의 공개된 하루 1,000회 신청 가능 트래픽에 대해 서버 한 대의 연속 실행은 약 720회/일입니다. 같은 키를 쓰는 다른 실행 인스턴스의 요청은 별도로 더해집니다.

GBIS 키는 MagicMirror **서버를 시작하는 환경**의 `GBIS_API_KEY`에 넣습니다. 예를 들어 PowerShell에서는 `$env:GBIS_API_KEY = '<발급받은 디코딩 키>'`, Raspberry Pi의 셸에서는 `export GBIS_API_KEY='<발급받은 디코딩 키>'`를 사용한 뒤 MagicMirror를 시작합니다. 키는 `config.js`나 Git 저장소에 넣지 않습니다. 키가 없으면 서버가 요청을 보내지 않고 `버스 API 키 필요`를 표시합니다. 자동실행 단계에서는 서비스의 환경 변수 설정을 별도로 작성합니다.

## 학식 설정

학식은 [한국외대 글로벌캠퍼스 식당 페이지](https://www.hufs.ac.kr/hufs/11319/subview.do)의 한그릇 식당, 외대한상 식당, HufsDorm 식당 세 곳을 표시합니다. 해당 페이지가 사용하는 HTML 식단 조회 요청을 서버에서 호출하며 별도 키나 설치 패키지는 필요하지 않습니다. 오늘 메뉴 중 현재 시간대에 가까운 식사와 각 메뉴의 주요 항목을 보여줍니다. 세 곳의 메뉴가 없으면 각 식당에 `오늘 메뉴 없음`을 표시합니다. 조회 방식과 갱신 정책은 [학식 모듈 문서](modules/MMM-GnuvilCafeteria/README.md)에 있습니다.

## 음악 재생 정보 설정

Linux 메인 PC에서 [Now Playing API](main-pc/now-playing-agent/README.md)를 실행하고, Raspberry Pi의 MagicMirror 서버에 `GNUVIL_NOW_PLAYING_URL`과 `GNUVIL_NOW_PLAYING_TOKEN`을 설정합니다. 설정 예시와 표시 방식은 [Now Playing 모듈 문서](modules/MMM-GnuvilNowPlaying/README.md)를 참고하세요. 실제 메인 PC 주소와 토큰은 나중에 실행 환경에 추가하면 됩니다. 재생 정보가 없을 때는 화면 아래쪽 중앙에 `현재 재생 중인 음악이 없습니다`를 표시합니다.

### 데스크탑에서 전체 화면과 음악을 함께 시험하기

`http://localhost:8081/`의 음악 데모는 시계와 음악만 넣은 별도 설정입니다. 버스·학식·날씨까지 함께 보려면 일반 설정을 쓰는 `http://localhost:8080/` 서버를 사용합니다. 로컬 모의 음악 API를 시험하는 동안에는 **GBIS_API_KEY를 설정했던 동일한 PowerShell 창**에서 다음을 실행한 후 서버를 다시 시작합니다. 이 예시는 저장소 루트에서 실행하며, `8766` 포트의 모의 API가 실행 중이어야 합니다.

```powershell
# 먼저 실행 중인 MagicMirror 서버를 Ctrl+C로 중지
$env:GNUVIL_NOW_PLAYING_URL = 'http://127.0.0.1:8766/now-playing'
cd .local/MagicMirror
& '..\runtime\node_modules\node\bin\node.exe' serveronly/index.js
```

메인 PC의 실제 음악 API를 사용할 때는 `GNUVIL_NOW_PLAYING_URL`을 해당 주소로 바꿉니다.

## 현재 범위와 확인할 항목

- 시계: 한국어 날짜, 한국 시간, 24시간제, 초 숨김
- 날씨: 글로벌캠퍼스 좌표를 기준으로 현재 기온과 날씨를 보조 정보로 표시
- Raspberry Pi의 실제 해상도에서 화면 배치와 성능 확인 필요
- 데스크탑 검증: 설정 검사 통과, 서버 시작 및 브라우저의 시계·한국어 날짜 표시 확인
- 버스 모듈 검증: 모의 GBIS 응답 테스트 및 MagicMirror 내 모듈 로드·설정 누락 표시 확인
- 학식 모듈 검증: 세 식당의 실제 HTML 응답 파싱, 모의 응답 테스트, MagicMirror 화면 표시 확인
- 29561의 `stationId`와 데스크탑에서의 실제 버스 도착정보 표시를 확인함
- Now Playing 모듈 검증: 재생·일시정지·앨범아트 모의 응답 테스트 완료; 실제 Linux 메인 PC와 Raspberry Pi 간 연결은 배포 시 확인 필요
- 대기질, 자동실행은 이후 Phase에서 추가

API 키와 토큰은 Git에 저장하지 않습니다.
