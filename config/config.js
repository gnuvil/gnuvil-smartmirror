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
    updateInterval: 30000,
    staleAfter: 300000
  }
});

modules.push({
  module: "MMM-GnuvilCafeteria",
  position: "bottom_right",
  config: {
    refreshInterval: 4 * 60 * 60 * 1000
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
  modules.push({
    module: "weather",
    position: "bottom_left",
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

if (typeof module !== "undefined") {
  module.exports = config;
}
