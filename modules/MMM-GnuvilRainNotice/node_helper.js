"use strict";

const NodeHelper = require("node_helper");
const { RainService } = require("./rain_service");

module.exports = NodeHelper.create({
  start() {
    this.service = new RainService({
      emit: (name, data) => this.sendSocketNotification(name, data),
      log: console
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "RAIN_NOTICE_CONFIG") this.service.start(payload);
  },

  stop() {
    this.service.stop();
  }
});
