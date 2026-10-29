# Windows 스마트미러 구성

동아리방 Windows PC 한 대로 스마트미러를 운영합니다. 브라우저에서 YouTube를 직접 틀면 영상은 다른 화면에, 소리는 AUX 스피커로 나가고, 스마트미러 화면에는 MagicMirror(시계·날씨·버스)와 함께 지금 재생 중인 곡명·아티스트·커버·진행바·비주얼라이저가 표시됩니다. 블루투스·AirPlay 수신은 쓰지 않습니다(Raspberry Pi 구성은 [pi/](../pi/README.md)).

```text
Windows PC
 ├─ 브라우저(Edge/Chrome): YouTube ──▶ 영상 화면 (LG E2260, 주 모니터)
 │      └─ Windows 미디어 세션(SMTC) ─▶ GnuvilSmtcReader.exe ─▶ Now Playing API (127.0.0.1:8765)
 ├─ 소리 ─▶ 기본 출력 "스피커"(AUX) ─▶ GnuvilLoopbackBars.exe (WASAPI 루프백)
 └─ MagicMirror ─▶ 스마트미러 (BIT-B1743H 세로, HDMI, \\.\DISPLAY2)
        ├─ MMM-GnuvilNowPlaying ◀─ Now Playing API
        └─ MMM-GnuvilVisualizer ◀─ GnuvilLoopbackBars.exe
```

## 폴더

| 위치 | 내용 |
|---|---|
| `now-playing/` | Windows용 Now Playing API. HTTP 서버는 `main-pc/now-playing-agent`의 것을 그대로 쓰고, 재생 정보만 SMTC에서 읽습니다. YouTube 제목 정리(`youtube_title.js`)와 iTunes 표지 검색(KR→US) → 실패 시 YouTube 썸네일 순으로 앨범아트를 정합니다. |
| `helpers/SmtcReader.cs` | SMTC를 1초마다 읽어 JSON 한 줄로 내보내는 도우미 |
| `helpers/LoopbackBars.cs` | 기본 출력 장치 소리를 루프백으로 캡처해 cava와 같은 `0;12;55;...;` 형식으로 내보내는 도우미 |
| `helpers/DisplayBounds.cs` | 디스플레이 번호를 받아 그 화면 좌표(`x,y,너비,높이`)를 출력하는 도우미 |
| `build-helpers.ps1` | 위 도우미들을 Windows 기본 .NET Framework 컴파일러(`csc.exe`)로 `windows/bin`에 빌드합니다. Visual Studio·SDK 불필요, exe는 Git에 넣지 않습니다. |
| `launcher/start-magicmirror.js` | 레포의 `config`, `css/custom.css`, `MMM-Gnuvil*` 모듈을 MagicMirror 설치 폴더에 연결하고(정션·하드링크, 관리자 권한 불필요), 미러 디스플레이 좌표를 읽어 MagicMirror(Electron)를 그 화면에 전체화면으로 띄웁니다. |
| `start-magicmirror.cmd`, `start-now-playing.cmd` | 로그를 남기며 위 스크립트와 Now Playing API를 실행 |
| `run-hidden.vbs` | `.cmd`를 창 없이 실행하고 끝날 때까지 기다림 (작업 스케줄러가 사용) |
| `install-autostart.ps1` | 로그온 시 두 `.cmd`를 실행하는 작업 스케줄러 작업 등록, 문서 폴더에 바로가기·사용 설명서 생성 |
| `mirror-control.ps1` | 손으로 켜기·끄기·다시 시작 (`start`/`stop`/`restart`, 바로가기가 사용) |
| `USER_GUIDE.md` | 동아리원용 사용 설명서. 설치 스크립트가 문서 폴더에 복사합니다. |
| `edge-captions/` | YouTube에 보이는 자막을 Now Playing API로 보내는 Edge 확장 (아래 [YouTube 자막](#youtube-자막)) |

## 처음 설치

이 PC에서는 `C:\gnuvil\gnuvil-smartmirror`(이 레포)와 `C:\gnuvil\MagicMirror`(v2.37.0)를 씁니다. MagicMirror는 레포 옆 `MagicMirror` 폴더를 기본으로 찾고, 다른 곳에 두었다면 `GNUVIL_MM_DIR`로 지정합니다.

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e --version 24.22.1
git clone https://github.com/gnuvil/gnuvil-smartmirror.git C:\gnuvil\gnuvil-smartmirror
git clone --depth 1 --branch v2.37.0 https://github.com/MagicMirrorOrg/MagicMirror.git C:\gnuvil\MagicMirror
cd C:\gnuvil\MagicMirror; npm run install-mm
cd C:\gnuvil\gnuvil-smartmirror
powershell -ExecutionPolicy Bypass -File windows\install-autostart.ps1 -MirrorDisplay 2
```

`-MirrorDisplay`는 스마트미러의 Windows 장치 번호입니다(`\\.\DISPLAY2` → `2`). 설정 앱의 화면 번호와 다를 수 있으니 아래 명령으로 확인합니다. 값은 사용자 환경변수 `GNUVIL_MIRROR_DISPLAY`에 저장되고, 좌표·해상도는 시작할 때마다 Windows에서 읽으므로 코드에 들어 있지 않습니다.

```powershell
Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | Select-Object DeviceName, Primary, Bounds
```

### 버스 API 키

`GBIS_API_KEY`는 파일이나 Git에 넣지 않고 **Windows 사용자 환경변수**로 직접 넣습니다.

1. `Win + R` → `rundll32 sysdm.cpl,EditEnvironmentVariables` 실행
2. 위쪽 "사용자 변수"에서 **새로 만들기** → 이름 `GBIS_API_KEY`, 값에 발급받은 **디코딩 키**
3. 로그아웃 후 다시 로그인(또는 재부팅)하면 MagicMirror가 새 값으로 시작합니다.

키가 없으면 미러에 `버스 API 키 필요`가 표시되고 요청은 보내지 않습니다. 같은 키를 쓰는 Raspberry Pi는 꺼 둡니다(하루 1,000회 한도, 이 PC 혼자 약 720회).

### YouTube 자막

YouTube 자막은 Windows 미디어 세션에 없으므로 Edge 확장이 플레이어에 **지금 보이는 자막 줄**을 읽어 `POST http://127.0.0.1:8765/caption`으로 보냅니다. 미러는 표지·재생바 아래에 최대 두 줄로 보여 줍니다.

1. Edge 주소창에 `edge://extensions` 입력
2. 왼쪽 아래 **개발자 모드** 켜기
3. **압축을 푼 확장 로드** → `C:\gnuvil\gnuvil-smartmirror\windows\edge-captions` 폴더 선택
4. 이미 열려 있던 YouTube 탭은 새로고침

- YouTube 플레이어에서 **자막(CC)이 켜져 있어야** 합니다. 자동 생성·번역 자막도 보이는 그대로 나옵니다. 자막이 없는 영상은 자막 줄이 생기지 않습니다.
- 확장은 **영상이 재생 중인 탭에서만** 보내고, 서버는 영상 제목이 미러에 보이는 곡과 같을 때만 붙입니다. 3초 동안 소식이 없으면 자막을 지웁니다.
- 서버는 이 PC에서 온 JSON 요청 중 `X-Gnuvil-Caption: 1` 헤더가 있는 것만 받습니다. 일반 웹 페이지는 이 헤더를 붙여 보낼 수 없습니다(사전 요청에 응답하지 않음). 확장은 이 PC의 API 말고 다른 곳으로는 아무것도 보내지 않습니다.
- 미러는 자막을 따라가도록 1초마다 API를 조회합니다(`config.js`의 `updateInterval: 1000`).
- `git pull`로 확장이 바뀌었으면 `edge://extensions`에서 이 확장의 **다시 로드**를 누르고 YouTube 탭을 새로고침합니다.

## 실행과 확인

문서 폴더의 **Gnuvil 스마트미러** 바로가기(켜기·끄기·다시 시작·로그 폴더)를 쓰거나 직접 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File windows\mirror-control.ps1 restart
curl.exe http://127.0.0.1:8765/now-playing
```

로그는 `%LOCALAPPDATA%\gnuvil\logs\now-playing.log`, `magicmirror.log`에 쌓입니다. 작업이 끝나면 작업 스케줄러가 1분 뒤 다시 시작합니다. 자동 실행과 바로가기를 지우려면 `install-autostart.ps1 -Remove`를 실행합니다.

**로그온 경로에 PowerShell을 쓰지 않는 이유**: 이 PC는 HDD라 부팅 직후 PowerShell 엔진이 준비되는 데 4분 반이 걸렸습니다(이벤트 로그 실측: 작업 시작 09:30:36 → 엔진 준비 09:35:12). 그래서 작업 스케줄러는 `wscript`로 `.cmd`를 창 없이 실행하고, 실제 일은 Node와 작은 C# 도우미가 합니다. PowerShell 스크립트는 설치·빌드·수동 제어에만 씁니다.

레포를 `git pull`로 갱신한 뒤에는 **다시 시작**합니다(시작 스크립트가 `custom.css` 하드링크를 다시 만듭니다). 도우미 소스(`helpers/*.cs`)가 바뀌었으면 **끄기** → `build-helpers.ps1` → **켜기** 순서로 합니다. 실행 중인 exe는 덮어쓸 수 없습니다.

## 동작 방식과 실측 결과

- **세션 선택**: SMTC에 여러 앱이 있으면 재생 중(Playing)인 브라우저 세션을 먼저, 없으면 재생 중인 다른 앱을, 그것도 없으면 `{"playing":false}`를 보냅니다. 일시정지·종료하면 미러에 `현재 재생 중인 음악이 없습니다`가 나옵니다.
- **진행 시간**: Edge는 재생 중에 위치를 갱신하지 않고 일시정지·탐색 때만 갱신합니다. 그래서 `위치 + (지금 − 마지막 갱신 시각)`으로 계산합니다. 다음 영상으로 넘어가도 진행 정보가 이전 영상 것으로 남아 있어, 곡이 바뀐 뒤 갱신이 올 때까지는 진행바를 숨깁니다.
- **앨범아트**: 정리한 아티스트·곡명으로 iTunes(KR→US)를 먼저 찾고, 없으면 SMTC 썸네일을 `artData`로 보냅니다. 검색이 끝나기 전 첫 몇 초는 썸네일이 보이다가 커버로 바뀔 수 있습니다.
- **제목 정리**: `아티스트 - 곡명`, `아티스트 '곡명'`, `곡명 / 아티스트`, `【아티스트】 곡명 | Cover`, `곡명 - 원곡 가수 Cover 부른 사람`과 `(Official MV)`·`[MV]`·`M/V`·`Lyrics` 같은 꼬리표, 채널명의 `- Topic`·`VEVO`·`Official`을 정리합니다. 예시는 `now-playing/test/youtube_title.test.js`에 있습니다. 모르는 형식은 제목을 그대로, 채널명을 아티스트로 씁니다.
- **광고**: 실측 중 광고가 나오지 않아 광고 재생 중 SMTC 값은 확인하지 못했습니다.
- **비주얼라이저**: 기본 출력 장치를 캡처하므로 소리는 AUX(스피커)가 Windows 기본 출력이어야 합니다. 출력 장치가 바뀌면 도우미가 종료되고 5초 뒤 새 기본 장치로 다시 시작합니다.
- **미러 창**: `focusable: false`로 띄워 영상 창의 포커스를 가져가지 않고, 미러 디스플레이 안에서만 전체화면입니다.

## 문제 확인

| 증상 | 확인 |
|---|---|
| 로그인 후 한참 안 뜸 | 부팅 직후 1~2분은 정상입니다. 작업 스케줄러에서 두 작업의 "마지막 실행 시간"과 `magicmirror.log`의 시각을 비교합니다. |
| 미러가 주 화면에 뜸 | `magicmirror.log`의 `미러 디스플레이 '...'를 찾지 못해` 메시지. `GNUVIL_MIRROR_DISPLAY`와 연결된 화면 목록을 비교합니다. |
| 곡 정보가 안 나옴 | `curl.exe http://127.0.0.1:8765/now-playing`. 503이면 `now-playing.log`에서 `SMTC reader is not built` 확인 후 `build-helpers.ps1`. 작업 표시줄 미디어 컨트롤(볼륨 팝업)에 곡이 안 보이면 브라우저가 SMTC에 올리지 않는 것입니다. |
| 자막이 안 나옴 | YouTube에서 CC가 켜져 있는지, `edge://extensions`에서 확장이 켜져 있는지 확인하고 YouTube 탭을 새로고침합니다. `curl.exe http://127.0.0.1:8765/now-playing`에 `caption`이 있는지 봅니다. |
| 막대가 안 움직임 | `magicmirror.log`의 `[MMM-GnuvilVisualizer]` 오류, 소리 설정의 기본 출력 장치 |
| 버스 정보 없음 | `버스 API 키 필요`면 위 키 설정, 그 외에는 `magicmirror.log`의 `[MMM-GnuvilBus]` |

## 테스트

```powershell
cd windows\now-playing; node --test test/*.test.js
cd ..\launcher; node --test test/*.test.js
```
