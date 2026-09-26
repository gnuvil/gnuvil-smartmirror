"use strict";

function nonNegativeInteger(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function arrival(item, suffix) {
  const minutes = nonNegativeInteger(item[`predictTime${suffix}`]);
  const seconds = nonNegativeInteger(item[`predictTimeSec${suffix}`]);
  if (minutes === null && seconds === null) return null;
  return {
    minutes,
    seconds,
    stopsAway: nonNegativeInteger(item[`locationNo${suffix}`])
  };
}

function normalizeResponse(raw, configuredRoutes, updatedAt) {
  const response = raw?.response || raw;
  const header = response?.msgHeader;
  const resultCode = Number(header?.resultCode);
  if (!Number.isInteger(resultCode)) {
    throw new Error("GBIS response header is invalid");
  }
  if (resultCode !== 0 && resultCode !== 4) {
    throw new Error(`GBIS result code ${resultCode}`);
  }

  let items = [];
  if (resultCode === 0) {
    const body = response.msgBody;
    if (!body || typeof body !== "object") {
      throw new Error("GBIS response body is invalid");
    }
    const list = body.busArrivalList;
    if (list !== null && list !== undefined) {
      if (Array.isArray(list)) items = list;
      else if (typeof list === "object") items = [list];
      else throw new Error("GBIS arrival list is invalid");
    }
  }

  const selected = configuredRoutes?.length ? configuredRoutes : null;
  const routes = selected ? selected.map((route) => {
    const item = items.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      return route.routeId != null
        ? String(candidate.routeId) === String(route.routeId)
        : String(candidate.routeName) === route.routeName;
    });
    return {
      routeId: route.routeId == null
        ? (item?.routeId == null ? null : String(item.routeId))
        : String(route.routeId),
      routeName: route.routeName,
      destination: item?.routeDestName || null,
      first: item ? arrival(item, 1) : null,
      second: item ? arrival(item, 2) : null
    };
  }) : items.filter((item) => item && typeof item === "object" && item.routeName).map((item) => ({
    routeId: item.routeId == null ? null : String(item.routeId),
    routeName: String(item.routeName),
    destination: item.routeDestName == null ? null : String(item.routeDestName),
    first: arrival(item, 1),
    second: arrival(item, 2)
  })).sort((a, b) => a.routeName.localeCompare(b.routeName, "ko", { numeric: true })
    || String(a.destination || "").localeCompare(String(b.destination || ""), "ko"));

  return { updatedAt, stale: false, routes };
}

module.exports = { normalizeResponse };
