Module.register("MMM-GnuvilNowPlaying", {
  defaults: {
    updateInterval: 5000
  },

  start() {
    this.track = null;
    this.unavailable = false;
    // 넘치는 글자의 길이(px)를 기억해 두면 화면을 다시 그려도 바로 같은 자리에서 이어서 움직인다.
    this.overflows = new Map();
    this.marqueeObserver = null;
    this.sendSocketNotification("NOW_PLAYING_CONFIG", this.config);
  },

  getStyles() {
    return ["MMM-GnuvilNowPlaying.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "NOW_PLAYING_DATA") return;
    this.track = payload?.playing ? payload : null;
    this.unavailable = payload?.unavailable === true;
    // 자막이 한 번 나온 곡은 자막 줄 사이사이에도 자리를 남겨 화면이 위아래로 흔들리지 않게 한다.
    if (this.track?.caption) this.captionTitle = this.track.title;
    else if (this.track?.title !== this.captionTitle) this.captionTitle = null;
    this.updateDom();
  },

  // 곡명·가수가 칸보다 길면 버스처럼 좌우로 움직인다.
  // 미러는 1초마다 화면을 새로 그려 애니메이션이 처음부터 다시 시작하므로, 시작 위치를 시계로 맞춘다.
  moveIfLong(box, text, overflow) {
    box.classList.toggle("is-overflowing", overflow > 2);
    if (overflow <= 2) return;
    const seconds = Math.max(7, overflow / 28 + 4);
    box.style.setProperty("--marquee-distance", `${overflow}px`);
    box.style.setProperty("--marquee-duration", `${seconds}s`);
    box.style.setProperty("--marquee-delay", `-${Date.now() % (seconds * 1000)}ms`);
  },

  marqueeCell(className, value, movers) {
    const box = document.createElement("span");
    box.className = className;
    const text = document.createElement("span");
    text.className = `${className}-text`;
    text.textContent = value;
    box.appendChild(text);
    const key = `${className}${value}`;
    if (this.overflows.has(key)) this.moveIfLong(box, text, this.overflows.get(key));
    movers.push({ box, text, key });
    return box;
  },

  getDom() {
    this.marqueeObserver?.disconnect();
    this.marqueeObserver = null;
    const movers = [];
    const wrapper = document.createElement("section");
    wrapper.className = "gnuvil-now-playing";
    const track = this.track;
    if (!track) {
      const idle = document.createElement("div");
      idle.className = "gnuvil-now-playing-idle";
      idle.textContent = this.unavailable
        ? "음악 정보를 불러올 수 없습니다"
        : "현재 재생 중인 음악이 없습니다";
      wrapper.appendChild(idle);
      return wrapper;
    }

    if (track.art) {
      const art = document.createElement("img");
      art.className = "gnuvil-now-playing-art";
      art.alt = "";
      art.src = track.art;
      art.addEventListener("error", () => { art.style.display = "none"; });
      wrapper.appendChild(art);
    }
    const details = document.createElement("div");
    details.className = "gnuvil-now-playing-details";
    const label = document.createElement("div");
    label.className = "gnuvil-now-playing-label";
    label.textContent = "재생 중";
    const title = document.createElement("div");
    title.className = "gnuvil-now-playing-title";
    title.textContent = track.title;
    const artist = document.createElement("div");
    artist.className = "gnuvil-now-playing-artist";
    artist.textContent = track.artist || track.album || "";
    details.append(label, title, artist);
    if (track.duration > 0 && track.position != null) {
      const progress = document.createElement("div");
      progress.className = "gnuvil-now-playing-progress";
      const fill = document.createElement("div");
      fill.className = "gnuvil-now-playing-progress-fill";
      fill.style.width = `${Math.min(100, Math.max(0, track.position / track.duration * 100))}%`;
      progress.appendChild(fill);
      details.appendChild(progress);
    }
    wrapper.appendChild(details);
    if (track.caption || this.captionTitle === track.title) {
      const caption = document.createElement("div");
      caption.className = "gnuvil-now-playing-caption";
      caption.textContent = track.caption || "";
      wrapper.appendChild(caption);
    }
    if (track.queue?.length) {
      const queue = document.createElement("div");
      queue.className = "gnuvil-now-playing-queue";
      const heading = document.createElement("div");
      heading.className = "gnuvil-now-playing-queue-label";
      heading.textContent = "다음 곡";
      queue.appendChild(heading);
      track.queue.slice(0, 3).forEach((next, index) => {
        const row = document.createElement("div");
        row.className = "gnuvil-now-playing-queue-item";
        const order = document.createElement("span");
        order.className = "gnuvil-now-playing-queue-order";
        order.textContent = String(index + 1);
        row.append(order,
          this.marqueeCell("gnuvil-now-playing-queue-title", next.title, movers),
          this.marqueeCell("gnuvil-now-playing-queue-artist", next.artist || "", movers));
        queue.appendChild(row);
      });
      wrapper.appendChild(queue);
    }
    if (typeof ResizeObserver !== "undefined" && movers.length) {
      this.marqueeObserver = new ResizeObserver(() => {
        for (const { box, text, key } of movers) {
          const overflow = Math.ceil(text.scrollWidth - box.clientWidth);
          this.overflows.set(key, overflow);
          this.moveIfLong(box, text, overflow);
        }
      });
      for (const { box } of movers) this.marqueeObserver.observe(box);
    }
    return wrapper;
  }
});
