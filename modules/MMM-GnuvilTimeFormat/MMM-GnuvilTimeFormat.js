// 12시간제 시각 표기를 화면에 맞게 고친다. 화면에 그리는 것은 없고 MagicMirror 코어는 고치지 않는다.
// 1) 화면 언어는 한국어(ko)지만 오전/오후는 AM/PM으로 쓴다 (시계와 시간별 날씨 예보가 moment의 ko 로케일을 쓴다).
// 2) 시계는 시를 "h"(3)로 따로 만들므로, 시만 단독으로 만드는 "h"를 "hh"(03)로 바꾼다. "h:mm A" 같은 다른 형식은 그대로다.
// moment는 모듈 파일보다 나중에(getScripts로) 읽히므로 start()에서 바꾼다. config에서 시계보다 앞에 두어 먼저 시작되게 한다.
Module.register("MMM-GnuvilTimeFormat", {
  getScripts() {
    return ["moment.js"];
  },

  start() {
    moment.updateLocale("ko", {
      meridiem: (hour) => (hour < 12 ? "AM" : "PM")
    });
    const format = moment.fn.format;
    moment.fn.format = function (pattern, ...rest) {
      return format.call(this, pattern === "h" ? "hh" : pattern, ...rest);
    };
  }
});
