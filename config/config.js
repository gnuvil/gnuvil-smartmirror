const clock = {
  module: "clock",
  position: "top_left",
  config: {
    timeFormat: 24,
    displaySeconds: false,
    timezone: "Asia/Seoul",
    dateFormat: "M월 D일 dddd"
  }
};

const modules = [clock];

modules.push({
  module: "MMM-GnuvilBus",
  position: "top_right",
  config: {
    stationId: "228001371", // 외국어대학교(29561), 정류소 조회 API 응답으로 확인
    stationMobileNo: "29561", // 외국어대학교, 외국어대학교기숙사 방면
    routes: null, // 이 정류장의 모든 노선을 표시
    walkMinutes: null,
    updateInterval: 120000,
    staleAfter: 300000
  }
});

// 학식(MMM-GnuvilCafeteria)은 미러 공간을 너무 많이 차지해 화면에서 뺐다. 모듈은 레포에 남아 있다.

modules.push({
  module: "MMM-GnuvilVisualizer",
  position: "bottom_bar",
  config: {
    bars: 32,
    framerate: 20,
    height: 80
  }
});

modules.push({
  module: "MMM-GnuvilNowPlaying",
  position: "bottom_bar",
  config: {
    updateInterval: 5000
  }
});

const environment = typeof process !== "undefined" ? process.env : {};
// 한국외국어대학교 글로벌캠퍼스의 대략적인 중심 좌표.
const latitudeText = environment.GNUVIL_WEATHER_LAT?.trim() || "37.33664";
const longitudeText = environment.GNUVIL_WEATHER_LON?.trim() || "127.26608";
const latitude = Number(latitudeText);
const longitude = Number(longitudeText);

if (
  latitudeText &&
  longitudeText &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
) {
  // 시계 바로 아래에 둔다 (같은 top_left에서 시계 다음 순서).
  modules.push({
    module: "weather",
    position: "top_left",
    config: {
      weatherProvider: "openmeteo",
      type: "current",
      lat: latitude,
      lon: longitude,
      onlyTemp: true
    }
  });
}

const config = {
  address: "localhost",
  language: "ko",
  locale: "ko-KR",
  timeFormat: 24,
  units: "metric",
  customCss: "css/custom.css",
  modules
};

// Windows에서는 시작 스크립트가 미러 디스플레이 좌표를 "x,y,너비,높이"로 넘긴다. 없으면 기본값(주 화면)을 쓴다.
const bounds = (environment.GNUVIL_MIRROR_BOUNDS || "").split(",").map((part) => Number(part.trim()));
if (bounds.length === 4 && bounds.every(Number.isInteger) && bounds[2] > 0 && bounds[3] > 0) {
  const [x, y, width, height] = bounds;
  // focusable: false로 미러 창이 영상 창의 포커스를 가져가지 않게 한다.
  config.electronOptions = { x, y, width, height, fullscreen: true, focusable: false, skipTaskbar: true };
}

if (typeof module !== "undefined") {
  module.exports = config;
}
