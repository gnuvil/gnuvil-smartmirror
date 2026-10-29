# MMM-GnuvilVisualizer

Raspberry Pi에서 실제로 재생 중인 소리를 [cava](https://github.com/karlstav/cava)로 분석해 막대 그래프로 표시합니다. node_helper가 `cava`를 실행해 PipeWire 기본 출력의 소리를 읽고, 프레임을 화면에 전달합니다. 소리가 없으면 막대가 사라지고 프레임 전송도 멈춥니다.

MagicMirror를 데스크톱 로그인 사용자로 실행해야 PipeWire에 접근할 수 있습니다. `cava`가 없으면 `[MMM-GnuvilVisualizer] cava is not installed`를 남기고 5초마다 다시 시도합니다. 설치는 [Pi 설정](../../pi/README.md)이 처리합니다.

| 설정 | 기본값 | 설명 |
|---|---|---|
| `bars` | 32 | 막대 수 (4–128) |
| `framerate` | 20 | 초당 프레임 (5–60). Pi 3B에서는 20 정도를 권장, Windows PC 설정은 30 |
| `height` | 80 | 높이(px) |
