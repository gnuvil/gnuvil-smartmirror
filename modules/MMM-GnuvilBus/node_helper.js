"use strict";

const NodeHelper = require("node_helper");
const { BusService } = require("./bus_service");

module.exports = NodeHelper.create({
  start() {
    this.service = new BusService({
      emit: (name, payload) => this.sendSocketNotification(name, payload),
      log: console
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BUS_CONFIG") this.service.configure(payload);
    if (notification === "BUS_REFRESH") void this.service.refresh();
  },

  stop() {
    this.service.stop();
  }
});
