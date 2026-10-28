Module.register("MMM-GnuvilNowPlaying", {
  defaults: {
    updateInterval: 5000
  },

  start() {
    this.track = null;
    this.unavailable = false;
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

  getDom() {
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
    return wrapper;
  }
});
