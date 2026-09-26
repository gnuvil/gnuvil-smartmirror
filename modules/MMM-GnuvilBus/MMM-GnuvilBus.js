Module.register("MMM-GnuvilBus", {
  defaults: {
    stationId: null,
    stationMobileNo: null,
    routes: null,
    walkMinutes: null,
    updateInterval: 120000,
    staleAfter: 300000
  },

  start() {
    this.busData = null;
    this.errorMessage = null;
    this.marqueeObserver = null;
    this.displayTimer = setInterval(() => {
      if (this.busData) this.updateDom();
    }, 30000);
    this.sendSocketNotification("BUS_CONFIG", this.config);
  },

  suspend() {
    if (this.displayTimer) clearInterval(this.displayTimer);
    this.displayTimer = null;
  },

  resume() {
    if (!this.displayTimer) {
      this.displayTimer = setInterval(() => {
        if (this.busData) this.updateDom();
      }, 30000);
    }
    this.updateDom();
  },

  clockNow() {
    return Date.now();
  },

  elapsedSeconds() {
    const updatedAt = this.busData?.updatedAt;
    return Number.isFinite(updatedAt)
      ? Math.max(0, Math.floor((this.clockNow() - updatedAt) / 1000))
      : 0;
  },

  waitSeconds(arrival) {
    const predicted = Number.isFinite(arrival?.seconds) && arrival.seconds >= 0
      ? arrival.seconds
      : Number.isFinite(arrival?.minutes) && arrival.minutes >= 0
        ? arrival.minutes * 60 : null;
    return predicted === null ? null : Math.max(0, predicted - this.elapsedSeconds());
  },

  soonestSeconds(route) {
    const waits = [this.waitSeconds(route.first), this.waitSeconds(route.second)]
      .filter((value) => value !== null);
    return waits.length ? Math.min(...waits) : null;
  },

  getStyles() {
    return ["MMM-GnuvilBus.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BUS_DATA") {
      this.busData = payload;
      this.errorMessage = null;
      this.updateDom();
    }
    if (notification === "BUS_ERROR") {
      this.busData = payload?.data || null;
      this.errorMessage = payload?.message || "버스 정보를 불러올 수 없습니다";
      this.updateDom();
    }
  },

  getDom() {
    this.marqueeObserver?.disconnect();
    this.marqueeObserver = null;
    const wrapper = document.createElement("section");
    wrapper.className = "gnuvil-bus";
    const title = document.createElement("div");
    title.className = "gnuvil-bus-title";
    title.textContent = "BUS";
    wrapper.appendChild(title);

    if (!this.busData) {
      const status = document.createElement("div");
      status.className = "gnuvil-bus-status";
      status.textContent = this.errorMessage || "버스 정보 확인 중";
      wrapper.appendChild(status);
      return wrapper;
    }

    if (this.errorMessage || this.busData.stale) {
      const status = document.createElement("div");
      status.className = "gnuvil-bus-status";
      status.textContent = this.busData.stale
        ? "버스 정보 업데이트 지연"
        : "연결 오류 · 마지막 정보";
      wrapper.appendChild(status);
    }

    const list = document.createElement("div");
    list.className = this.busData.stale ? "gnuvil-bus-list stale" : "gnuvil-bus-list";
    const routes = this.busData.routes.filter((route) => this.soonestSeconds(route) !== null)
      .sort((a, b) => this.soonestSeconds(a) - this.soonestSeconds(b)
        || a.routeName.localeCompare(b.routeName, "ko", { numeric: true })
        || String(a.destination || "").localeCompare(String(b.destination || ""), "ko"));
    if (routes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gnuvil-bus-status";
      empty.textContent = "현재 도착 정보 없음";
      list.appendChild(empty);
    }
    const movingDestinations = [];
    for (const route of routes) {
      const row = document.createElement("div");
      row.className = "gnuvil-bus-row";
      const name = document.createElement("span");
      name.className = "gnuvil-bus-route";
      const number = document.createElement("span");
      number.className = "gnuvil-bus-number";
      number.textContent = route.routeName;
      name.appendChild(number);
      if (route.destination) {
        const separator = document.createElement("span");
        separator.className = "gnuvil-bus-separator";
        separator.textContent = " · ";
        const destination = document.createElement("span");
        destination.className = "gnuvil-bus-destination";
        const destinationText = document.createElement("span");
        destinationText.className = "gnuvil-bus-destination-text";
        destinationText.textContent = `${route.destination}행`;
        destination.appendChild(destinationText);
        name.append(separator, destination);
        movingDestinations.push({ destination, destinationText });
      }
      const first = this.waitSeconds(route.first) !== null ? route.first : route.second;
      const second = first === route.first && this.waitSeconds(route.second) !== null ? route.second : null;
      const firstMinutes = Math.ceil(this.waitSeconds(first) / 60);
      const secondMinutes = second && Math.ceil(this.waitSeconds(second) / 60);
      const formatArrival = (minutes) => minutes === 0 ? "곧 도착" : `${minutes}분`;
      const arrival = document.createElement("span");
      arrival.className = "gnuvil-bus-arrival";
      arrival.textContent = secondMinutes == null
        ? formatArrival(firstMinutes)
        : `${formatArrival(firstMinutes)} · ${formatArrival(secondMinutes)}`;
      row.append(name, arrival);

      const walkMinutes = this.config.walkMinutes;
      if (Number.isInteger(walkMinutes) && walkMinutes >= 0) {
        const hint = firstMinutes <= walkMinutes
          ? "서둘러 출발"
          : firstMinutes <= walkMinutes + 3 ? "지금 출발" : null;
        if (hint) {
          const hintElement = document.createElement("span");
          hintElement.className = "gnuvil-bus-hint";
          hintElement.textContent = hint;
          row.appendChild(hintElement);
        }
      }
      list.appendChild(row);
    }
    if (typeof ResizeObserver !== "undefined" && movingDestinations.length) {
      this.marqueeObserver = new ResizeObserver(() => {
        for (const { destination, destinationText } of movingDestinations) {
          const overflow = Math.ceil(destinationText.scrollWidth - destination.clientWidth);
          destination.classList.toggle("is-overflowing", overflow > 2);
          if (overflow > 2) {
            destination.style.setProperty("--marquee-distance", `${overflow}px`);
            destination.style.setProperty("--marquee-duration", `${Math.max(7, overflow / 28 + 4)}s`);
          }
        }
      });
      for (const { destination } of movingDestinations) this.marqueeObserver.observe(destination);
    }
    wrapper.appendChild(list);
    return wrapper;
  }
});
