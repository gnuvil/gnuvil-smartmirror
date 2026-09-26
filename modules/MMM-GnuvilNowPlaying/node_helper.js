"use strict";

const NodeHelper = require("node_helper");
const { NowPlayingService } = require("./now_playing_service");

module.exports = NodeHelper.create({
  start() {
    this.service = new NowPlayingService({
      emit: (name, data) => this.sendSocketNotification(name, data),
      log: console
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "NOW_PLAYING_CONFIG") this.service.start(payload?.updateInterval);
  },

  stop() {
    this.service.stop();
  }
});
