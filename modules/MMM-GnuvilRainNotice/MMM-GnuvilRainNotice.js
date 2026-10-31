// 비·눈 예보가 있으면 안내를, 없으면 시간대에 맞는 간단한 인사말을 보여 준다.
const GREETINGS = [
  [5, "좋은 아침이에요!"],
  [12, "즐거운 오후 보내세요!"],
  [17, "오늘 하루도 수고했어요!"],
  [22, "늦은 시간이에요, 푹 쉬세요!"]
];

function greetingAt(date, timeZone) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date));
  // 5시 이전은 전날 22시부터 이어지는 밤 인사
  let text = GREETINGS[GREETINGS.length - 1][1];
  for (const [from, value] of GREETINGS) if (hour >= from) text = value;
  return text;
}

Module.register("MMM-GnuvilRainNotice", {
  defaults: {
    lat: null,
    lon: null,
    timeZone: "Asia/Seoul",
    updateInterval: 1800000
  },

  start() {
    this.kind = null;
    this.greeting = this.currentGreeting();
    this.sendSocketNotification("RAIN_NOTICE_CONFIG", this.config);
    // 인사말은 시간대가 바뀔 때만 다시 그린다.
    setInterval(() => {
      const greeting = this.currentGreeting();
      if (greeting === this.greeting) return;
      this.greeting = greeting;
      if (!this.kind) this.updateDom();
    }, 60000);
  },

  now() {
    return new Date();
  },

  currentGreeting() {
    return greetingAt(this.now(), this.config.timeZone);
  },

  getStyles() {
    return ["MMM-GnuvilRainNotice.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "RAIN_NOTICE") return;
    const kind = payload?.kind === "rain" || payload?.kind === "snow" ? payload.kind : null;
    if (kind === this.kind) return;
    this.kind = kind;
    this.updateDom();
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = this.kind ? "gnuvil-rain-notice" : "gnuvil-rain-notice greeting";
    if (this.kind) wrapper.textContent = this.kind === "snow" ? "오늘은 눈이 올 수 있어요!" : "오늘은 비가 올 수 있어요!";
    else wrapper.textContent = this.greeting;
    return wrapper;
  }
});
