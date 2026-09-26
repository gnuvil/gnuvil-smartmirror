# 메인 PC Now Playing API

Linux 데스크탑에서 MPRIS 재생 정보를 `playerctl`로 읽어 MagicMirror에 전달합니다. 음악 플레이어와 이 서버는 **같은 로그인 사용자 세션**에서 실행해야 합니다.

## 준비

메인 PC에 Node.js 24와 `playerctl`을 설치하고, 음악을 재생한 상태에서 다음을 확인합니다.

```sh
playerctl --all-players status
playerctl --all-players metadata --format '{{title}} | {{artist}} | {{mpris:artUrl}}'
```

여러 플레이어가 실행 중이면 재생 중인 첫 번째 플레이어를 표시합니다. 특정 플레이어만 사용하려면 `GNUVIL_PLAYER=spotify`처럼 `playerctl --list-all`에 나오는 이름을 지정합니다.

## 실행

같은 PC에서 시험할 때는 기본값인 `127.0.0.1:8765`로 시작합니다.

```sh
node server.js
curl http://127.0.0.1:8765/now-playing
```

Raspberry Pi가 LAN으로 접근할 때는 메인 PC에서 다음 변수를 지정한 뒤 서버를 실행합니다.

```sh
export GNUVIL_NOW_PLAYING_BIND=0.0.0.0
export GNUVIL_NOW_PLAYING_PORT=8765
export GNUVIL_NOW_PLAYING_TOKEN='<직접 생성한 긴 임의 문자열>'
node server.js
```

외부 인터페이스에 바인딩하려면 토큰이 반드시 필요합니다. 방화벽은 Raspberry Pi의 LAN 주소에서만 이 포트로 접근하도록 설정합니다. 이 HTTP 연결은 암호화되지 않으므로 신뢰하는 내부망에서만 사용합니다. 토큰은 Git에 기록하지 말고 실행 환경에서 설정합니다.

응답은 재생 중일 때 곡명, 아티스트, 앨범, 진행 시간(초), 길이(초), 앨범아트를 포함합니다. 일시정지하거나 재생 정보가 없으면 `{ "playing": false }`를 반환합니다. 앨범아트가 `https:` URL이면 URL을, 플레이어의 로컬 `file:` 이미지이면 크기와 형식을 검사한 뒤 이미지 데이터를 전달합니다. 이미지가 없거나 지원되지 않으면 글자 정보만 표시됩니다.
