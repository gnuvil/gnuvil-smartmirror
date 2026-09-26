Module.register("MMM-GnuvilCafeteria", {
  defaults: {
    refreshInterval: 4 * 60 * 60 * 1000
  },

  start() {
    this.cafeteriaData = null;
    this.sendSocketNotification("CAFETERIA_CONFIG", this.config);
    this.domTimer = setInterval(() => this.updateDom(), 60 * 1000);
  },

  suspend() {
    if (this.domTimer) clearInterval(this.domTimer);
    this.domTimer = null;
  },

  resume() {
    if (!this.domTimer) this.domTimer = setInterval(() => this.updateDom(), 60 * 1000);
  },

  getStyles() {
    return ["MMM-GnuvilCafeteria.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CAFETERIA_DATA") {
      this.cafeteriaData = payload;
      this.updateDom();
    }
    if (notification === "CAFETERIA_ERROR") {
      this.cafeteriaData = null;
      this.updateDom();
    }
  },

  today() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  },

  currentMinutes() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type).value);
    return get("hour") * 60 + get("minute");
  },

  relevantMeals(meals) {
    const minute = (time) => {
      const [hour, min] = time.split(":").map(Number);
      return hour * 60 + min;
    };
    const scheduled = meals.filter((meal) => meal.start && meal.end
      && !(meal.start === "00:00" && meal.end === "00:00")
      && !/상시/.test(meal.mealType));
    if (!scheduled.length) return meals.slice(0, 2);
    const now = this.currentMinutes();
    const active = scheduled.filter((meal) => minute(meal.start) <= now && now <= minute(meal.end));
    const pool = active.length ? active : scheduled.filter((meal) => minute(meal.start) > now);
    const candidates = pool.length ? pool : scheduled;
    const target = active.length ? Math.min(...active.map((meal) => minute(meal.start)))
      : pool.length ? Math.min(...pool.map((meal) => minute(meal.start)))
        : Math.max(...scheduled.map((meal) => minute(meal.start)));
    return candidates.filter((meal) => Math.abs(minute(meal.start) - target) <= 30).slice(0, 2);
  },

  getDom() {
    const wrapper = document.createElement("section");
    wrapper.className = "gnuvil-cafeteria";
    const title = document.createElement("div");
    title.className = "gnuvil-cafeteria-title";
    title.textContent = "오늘의 학식";
    wrapper.appendChild(title);

    const data = this.cafeteriaData;
    if (!data || data.date !== this.today()) {
      const status = document.createElement("div");
      status.className = "gnuvil-cafeteria-status";
      status.textContent = "오늘 메뉴 확인 중";
      wrapper.appendChild(status);
      return wrapper;
    }
    if (data.partialFailure) {
      const status = document.createElement("div");
      status.className = "gnuvil-cafeteria-status";
      status.textContent = "일부 식당 업데이트 지연";
      wrapper.appendChild(status);
    }
    for (const cafe of data.cafes) {
      const card = document.createElement("div");
      card.className = "gnuvil-cafeteria-card";
      const name = document.createElement("div");
      name.className = "gnuvil-cafeteria-name";
      name.textContent = cafe.name;
      card.appendChild(name);
      const meals = this.relevantMeals(cafe.meals);
      if (!meals.length) {
        const empty = document.createElement("div");
        empty.className = "gnuvil-cafeteria-empty";
        empty.textContent = "오늘 메뉴 없음";
        card.appendChild(empty);
      }
      for (const meal of meals) {
        const type = document.createElement("div");
        type.className = "gnuvil-cafeteria-meal";
        type.textContent = `${meal.mealType}${meal.start ? ` · ${meal.start}` : ""}`;
        card.appendChild(type);
        const menu = document.createElement("div");
        menu.className = "gnuvil-cafeteria-menu";
        menu.textContent = meal.menu.slice(0, 4).join(" · ")
          + (meal.menu.length > 4 ? ` 외 ${meal.menu.length - 4}개` : "");
        card.appendChild(menu);
      }
      wrapper.appendChild(card);
    }
    return wrapper;
  }
});
