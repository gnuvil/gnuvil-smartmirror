const clock = {
  module: "clock",
  position: "top_left",
  header: "GNUVIL Smart Mirror",
  config: {
    timeFormat: 12,
    showPeriod: true,
    showPeriodUpper: true, // AM/PM, 시는 03처럼 두 자리 (MMM-GnuvilTimeFormat)
    displaySeconds: false,
    timezone: "Asia/Seoul",
    dateFormat: "M월 D일 dddd"
  }
};

// 화면에 그리는 것 없이 12시간제 표기를 고친다 (오전/오후 → AM/PM, 시계의 시 3 → 03). 시계보다 앞에 둔다.
const modules = [{ module: "MMM-GnuvilTimeFormat" }, clock];

modules.push({
  module: "MMM-GnuvilBus",
  position: "top_right",
  config: {
    // 외대.모현빌라(29555), 서울 방면. GBIS 통합검색 응답으로 확인 (2026-10-29).
    // 학교 안 외국어대학교(29561)는 1005·1117·1150·1303의 출발지라 출발 전 도착 시간이 비어 1500-2만 보였다.
    stationId: "228000346",
    stationMobileNo: "29555",
    routes: null, // 이 정류장의 모든 노선을 표시
    walkMinutes: null,
    subtractMinutes: 5, // 동아리방에서 정류장까지 걷는 시간만큼 빼서 "출발까지 남은 시간"으로 보여 준다
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
    framerate: 30, // Windows PC 기준. Raspberry Pi 3B에서는 20 권장
    height: 80
  }
});

modules.push({
  module: "MMM-GnuvilNowPlaying",
  position: "bottom_bar",
  config: {
    updateInterval: 1000 // YouTube 자막을 따라가도록 1초마다 조회
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
  // 온도 바로 위, 예전 "용인시, KR-41" 자리에 오늘 비(눈) 예보가 있을 때만 안내 문구를 띄운다.
  modules.push({
    module: "MMM-GnuvilRainNotice",
    position: "top_left",
    config: {
      lat: latitude,
      lon: longitude
    }
  });
  // 시계 바로 아래에 둔다 (같은 top_left에서 시계 다음 순서). 지역명 머리글은 비 안내로 대신한다.
  modules.push({
    module: "weather",
    position: "top_left",
    config: {
      weatherProvider: "openmeteo",
      type: "current",
      lat: latitude,
      lon: longitude,
      onlyTemp: true,
      appendLocationNameToHeader: false
    }
  });
  // 온도 아래 예보: 지금부터 1시간 단위 3칸, 이어서 내일·모레를 날짜와 최고·최저 기온으로 보여 준다.
  // 같은 Open-Meteo를 쓰므로 키가 필요 없다.
  modules.push({
    module: "weather",
    position: "top_left",
    classes: "gnuvil-forecast",
    config: {
      weatherProvider: "openmeteo",
      type: "hourly",
      lat: latitude,
      lon: longitude,
      maxEntries: 3,
      hourlyForecastIncrements: 1,
      timeFormat: 12,
      showPeriod: true,
      showPeriodUpper: true,
      appendLocationNameToHeader: false,
      fade: false,
      tableClass: "small"
    }
  });
  modules.push({
    module: "weather",
    position: "top_left",
    classes: "gnuvil-forecast gnuvil-forecast-days",
    config: {
      weatherProvider: "openmeteo",
      type: "forecast",
      lat: latitude,
      lon: longitude,
      ignoreToday: true,
      maxNumberOfDays: 2,
      forecastDateFormat: "M/D ddd",
      appendLocationNameToHeader: false,
      fade: false,
      tableClass: "small"
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
