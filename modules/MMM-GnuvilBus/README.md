# MMM-GnuvilBus

경기버스정보(GBIS)의 정류소별 버스 도착정보 목록을 30초마다 한 번 조회합니다. 현재 도착 예정 시간이 있는 노선만 가까운 순서대로 표시하며, 버스 번호는 고정하고 긴 행선지만 가로로 움직여 끝까지 볼 수 있습니다. API 호출과 응답 정규화는 `node_helper.js` 쪽에서 수행합니다.

## 설정

`config/config.js`의 `MMM-GnuvilBus` 항목에 실제 값을 입력합니다.

```js
config: {
  stationId: "228001371",
  stationMobileNo: "29561",
  routes: null, // 모든 노선
  walkMinutes: null,
  updateInterval: 30000,
  staleAfter: 300000
}
```

`stationMobileNo`는 승객용 정류소번호입니다. 현재 기준은 외국어대학교(29561), 외국어대학교기숙사 방면입니다. `stationId` 228001371은 사용자가 2026-09-26 정류소명/번호 목록조회 API 응답에서 확인한 값입니다. 서버는 이 값을 이용해 정류소 조회 단계를 생략합니다. `stationId`를 비우면 [정류소명/번호 목록조회](https://www.gbis.go.kr/gbis2014/publicService.action?cmd=mBusStation)의 `keyword=29561` 결과에서 번호가 일치하는 ID를 찾아 사용합니다. `routes: null`은 API가 반환한 모든 노선을 표시합니다. 같은 노선이 양방향 항목으로 반환되면 `routeDestName`을 표시하므로 1500-2번의 에버랜드행과 사당행도 구분됩니다. GBIS가 한쪽 방향의 도착정보를 반환하지 않으면 그 방향은 표시되지 않습니다. 특정 노선만 표시하려면 `routes`에 `{ routeName, routeId? }` 항목을 넣을 수 있습니다. `walkMinutes`는 실제 평균 도보시간을 확인한 뒤 정수로 지정할 수 있습니다. `null`이면 출발 안내 문구를 표시하지 않습니다.

GBIS API 키는 **MagicMirror를 실행하는 서버의** `GBIS_API_KEY` 환경 변수에 넣습니다. 공공데이터포털의 디코딩 키와 인코딩 키를 모두 사용할 수 있습니다. 키는 저장소, `config.js`, 브라우저로 전달하지 않습니다. 정류소·키 중 하나라도 없으면 네트워크 요청을 시작하지 않고 설정 오류를 표시합니다.

`stationId`를 비워 두면 **정류소명/번호 목록조회**와 **버스 도착정보 목록조회** 두 API를 사용합니다. HTTP 403이 `station lookup`에서 발생하면 공공데이터포털에서 정류소 조회 API의 활용신청·승인 상태를 확인하세요. `arrival lookup`에서 발생하면 버스 도착정보 API의 이용 권한을 확인하세요. 이미 확인된 숫자 `stationId`를 `config.js`에 설정하면 정류소 조회 호출은 생략됩니다. 정확한 ID를 검증하지 않은 상태에서 임의 값을 넣지 마세요.

사용한 API는 [경기버스정보의 버스 도착정보 목록조회](https://www.gbis.go.kr/gbis2014/publicService.action?cmd=mBusArrivalStation)입니다. `format=json`, `stationId`, `serviceKey`를 보내고 `response.msgBody.busArrivalList`의 `predictTime1/2`, `predictTimeSec1/2`, `locationNo1/2`를 정규화합니다.

## 검증

이 디렉터리에서 `node --test`를 실행합니다. 실제 GBIS 호출은 키와 정류소가 준비된 뒤 확인해야 합니다.
