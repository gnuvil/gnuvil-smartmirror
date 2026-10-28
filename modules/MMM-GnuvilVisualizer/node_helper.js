"use strict";

const NodeHelper = require("node_helper");
const { CavaService } = require("./cava_service");

module.exports = NodeHelper.create({
  start() {
    this.service = new CavaService({
      emit: (name, data) => this.sendSocketNotification(name, data),
      log: console
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "VISUALIZER_CONFIG") this.service.start(payload);
  },

  stop() {
    this.service.stop();
  }
});
