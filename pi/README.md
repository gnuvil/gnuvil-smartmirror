# Raspberry Pi 원스탑 음악 허브

노트북·휴대폰을 Pi에 연결하면 소리는 AUX로 연결한 스피커에서 나오고, 스마트미러에 곡 정보·앨범아트·비주얼라이저가 표시됩니다.

```text
노트북/휴대폰 ──Bluetooth 또는 AirPlay──▶ Raspberry Pi ──3.5mm AUX──▶ 스피커
                                             │
                                             ├─ mpris-proxy / shairport-sync → MPRIS
                                             ├─ now-playing-agent(playerctl, 127.0.0.1:8765) → MMM-GnuvilNowPlaying
                                             ├─ cava(PipeWire) → MMM-GnuvilVisualizer
                                             └─ HDMI → 스마트미러
```

## 설치

Raspberry Pi Imager로 Raspberry Pi OS (64-bit, Desktop)를 설치하고 데스크톱 자동 로그인 사용자로 SSH 접속한 뒤 실행합니다. 검증 환경은 Raspberry Pi 3 Model B, Raspberry Pi OS trixie입니다.

```sh
git clone https://github.com/gnuvil/gnuvil-smartmirror ~/gnuvil-smartmirror
~/gnuvil-smartmirror/pi/setup.sh
```

스크립트는 여러 번 실행해도 됩니다. 하는 일:

- `shairport-sync`, `playerctl`, `cava`, `bluez-tools` 설치
- Node.js를 `~/.local/node`에, MagicMirror²를 `~/MagicMirror`에 설치
- 이 저장소의 `config.js`, `custom.css`, `MMM-Gnuvil*` 모듈을 MagicMirror에 심볼릭 링크로 연결 (`git pull`만 하면 반영)
- 블루투스를 `Gnuvil Mirror` 이름으로 항상 검색·페어링 가능하게 설정 (`gnuvil-bt-agent` 시스템 서비스)
- AirPlay 수신기를 사용자 PipeWire로 출력하도록 사용자 서비스로 실행
- 사용자 서비스 `gnuvil-mpris-proxy`, `gnuvil-shairport`, `gnuvil-now-playing`, `magicmirror` 등록

버스 정보용 `GBIS_API_KEY`는 Git 밖의 `~/.config/gnuvil/env`(권한 600)에 넣고 `systemctl --user restart magicmirror`로 다시 시작합니다.

## 연결 방법

| 기기 | 방법 | 앨범아트 |
|---|---|---|
| Windows 노트북 | 설정 → Bluetooth → 장치 추가 → `Gnuvil Mirror` | 곡명으로 iTunes 검색 |
| Mac | 제어 센터 → 사운드 → AirPlay `Gnuvil Mirror` (Bluetooth도 가능) | AirPlay가 보낸 표지 |
| iPhone | 제어 센터 → AirPlay `Gnuvil Mirror` | AirPlay가 보낸 표지 |
| Android | Bluetooth → `Gnuvil Mirror` | 곡명으로 iTunes 검색 |

블루투스는 PIN 없이 페어링됩니다. 동아리방 근처 누구나 연결할 수 있으므로 필요하면 `gnuvil-bt-agent` 서비스를 끄고 직접 페어링합니다.

## 문제 확인

```sh
systemctl --user status magicmirror gnuvil-now-playing gnuvil-shairport gnuvil-mpris-proxy
journalctl --user -u magicmirror -n 50
playerctl --all-players metadata
curl http://127.0.0.1:8765/now-playing
wpctl status
```

출력 장치는 `wpctl status`의 Sinks에서 `Built-in Audio Stereo`(3.5mm 단자)가 기본값(`*`)이어야 합니다. 아니면 `wpctl set-default <번호>`로 바꿉니다.
