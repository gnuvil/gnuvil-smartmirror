Module.register("MMM-GnuvilVisualizer", {
  defaults: {
    bars: 32,
    framerate: 20,
    height: 80
  },

  start() {
    this.canvas = null;
    this.frame = null;
    this.sendSocketNotification("VISUALIZER_CONFIG", {
      bars: this.config.bars,
      framerate: this.config.framerate
    });
  },

  getStyles() {
    return ["MMM-GnuvilVisualizer.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "VISUALIZER_FRAME") return;
    this.frame = Array.isArray(payload) ? payload : null;
    this.draw();
  },

  // 매 프레임 updateDom을 부르면 DOM이 다시 만들어지므로 캔버스에만 그린다.
  draw() {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.classList.toggle("is-silent", !this.frame);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!this.frame) return;
    const count = this.frame.length;
    const slot = width / count;
    const barWidth = Math.max(1, slot * 0.6);
    context.fillStyle = getComputedStyle(canvas).color;
    this.frame.forEach((value, index) => {
      const barHeight = Math.max(2, value / 100 * height);
      context.fillRect(index * slot + (slot - barWidth) / 2, height - barHeight, barWidth, barHeight);
    });
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "gnuvil-visualizer";
    const canvas = document.createElement("canvas");
    canvas.className = "gnuvil-visualizer-canvas is-silent";
    canvas.style.height = `${this.config.height}px`;
    wrapper.appendChild(canvas);
    this.canvas = canvas;
    return wrapper;
  }
});
