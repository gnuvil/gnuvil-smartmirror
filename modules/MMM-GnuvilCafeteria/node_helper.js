"use strict";

const NodeHelper = require("node_helper");
const { CafeteriaService } = require("./cafeteria_service");

module.exports = NodeHelper.create({
  start() {
    this.service = new CafeteriaService({
      emit: (name, payload) => this.sendSocketNotification(name, payload),
      log: console
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CAFETERIA_CONFIG") this.service.start(payload?.refreshInterval);
    if (notification === "CAFETERIA_REFRESH") void this.service.refresh();
  },

  stop() {
    this.service.stop();
  }
});
