# MMM-GnuvilNowPlaying

메인 PC의 [Now Playing API](../../main-pc/now-playing-agent/README.md)를 5초마다 조회합니다. 화면 아래쪽 중앙에 재생 중인 곡을 표시하고, 일시정지·중지 때는 `현재 재생 중인 음악이 없습니다`, 연결 오류 때는 `음악 정보를 불러올 수 없습니다`를 표시합니다. 앨범아트가 있으면 함께 표시합니다.

[Pi 음악 허브](../../pi/README.md) 구성에서는 Now Playing API가 Pi 안(`127.0.0.1:8765`)에서 실행되며 `pi/setup.sh`가 주소를 설정합니다. 블루투스로 재생해 앨범아트가 오지 않으면 API가 곡명으로 iTunes에서 표지를 찾습니다(`GNUVIL_COVER_LOOKUP=off`로 끔).

별도의 Linux 메인 PC API를 쓸 때는 MagicMirror 서버(Raspberry Pi)의 실행 환경에 다음을 설정합니다.

```sh
export GNUVIL_NOW_PLAYING_URL='http://<메인-PC-LAN-IP>:8765/now-playing'
export GNUVIL_NOW_PLAYING_TOKEN='<메인 PC에서 설정한 동일한 토큰>'
```

주소와 토큰은 `config.js`에 넣지 않습니다. 주소가 없거나 잘못되어도 대기 문구를 표시합니다. `updateInterval`은 `config/config.js`에서 바꿀 수 있으며 최소 3000ms입니다. 메인 PC API는 Linux 그래픽 로그인 세션에서 실행해야 MPRIS 플레이어를 찾을 수 있습니다.
