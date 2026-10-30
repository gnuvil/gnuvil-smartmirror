Module.register("MMM-GnuvilRainNotice", {
  defaults: {
    lat: null,
    lon: null,
    timeZone: "Asia/Seoul",
    updateInterval: 1800000
  },

  start() {
    this.kind = null;
    this.sendSocketNotification("RAIN_NOTICE_CONFIG", this.config);
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
    // 비 소식이 없으면 빈 칸이 되고 CSS가 자리를 없앤다.
    wrapper.className = this.kind ? "gnuvil-rain-notice" : "gnuvil-rain-notice empty";
    if (this.kind) wrapper.textContent = this.kind === "snow" ? "오늘은 눈이 올 수 있어요!" : "오늘은 비가 올 수 있어요!";
    return wrapper;
  }
});
