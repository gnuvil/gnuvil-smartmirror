# MMM-GnuvilRainNotice

온도 바로 위(예전 지역명 자리)에 오늘 비 예보가 있을 때만 `오늘은 비가 올 수 있어요!`를 표시합니다. 눈만 예보되면 `오늘은 눈이 올 수 있어요!`라고 씁니다. 비 소식이 없으면 자리를 차지하지 않습니다.

[Open-Meteo](https://open-meteo.com/) 시간별 예보(`precipitation_probability`, `precipitation`, `weather_code`)를 30분마다 한 번 조회하며 API 키가 필요 없습니다. 오늘 남은 시간 중 한 시간이라도 강수 확률이 50% 이상이거나 강수량이 0.3mm 이상이면 알립니다. 지난 시간과 내일은 보지 않습니다. 조회에 실패하면 마지막 안내를 그대로 두고 `[MMM-GnuvilRainNotice] ...` 오류를 한 번 남깁니다.

| 설정 | 기본값 | 설명 |
|---|---|---|
| `lat`, `lon` | 없음 | 위치. `config.js`는 날씨 모듈과 같은 좌표를 넘깁니다 |
| `timeZone` | `Asia/Seoul` | "오늘"과 "지금"을 정하는 시간대 |
| `updateInterval` | 1800000 | 조회 간격(ms, 최소 10분) |

## 검증

이 디렉터리에서 `node --test`를 실행합니다.
