/*
 * 채용 마감일에서 거꾸로 계산하는 체력측정 일정
 *
 * 예약 규칙(전국 센터 공통 안내, 센터 사정에 따라 다를 수 있음)
 *   1차: 매월 1일 13시 오픈 → 그달 2일~16일 측정분
 *   2차: 매월 16일 13시 오픈 → 그달 17일~다음 달 1일 측정분
 * 출처: 서울시 미디어허브 안내, 국민체력100 예약 페이지
 */
(function (root) {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var SAFETY_DAYS = 7; // 인증서 발급·서류 준비 여유

  function atMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addMonths(d, n) {
    var r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    // 31일 → 2월처럼 날짜가 넘어가면 그 달 마지막 날로 맞춘다
    if (r.getDate() !== d.getDate()) r = new Date(r.getFullYear(), r.getMonth(), 0);
    return r;
  }

  function addDays(d, n) {
    return new Date(d.getTime() + n * DAY);
  }

  function fmt(d) {
    var w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + "(" + w + ")";
  }

  /** 측정일이 주어졌을 때 그 날짜의 예약이 열리는 시각 */
  function bookingOpenFor(measureDate) {
    var y = measureDate.getFullYear();
    var m = measureDate.getMonth();
    var d = measureDate.getDate();
    if (d === 1) return new Date(y, m - 1, 16, 13, 0);
    if (d <= 16) return new Date(y, m, 1, 13, 0);
    return new Date(y, m, 16, 13, 0);
  }

  /** from~to 사이에 열리는 예약 회차 목록 */
  function bookingRounds(from, to) {
    var rounds = [];
    var cursor = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    while (cursor <= to) {
      var y = cursor.getFullYear();
      var m = cursor.getMonth();
      [
        { open: new Date(y, m, 1, 13, 0), start: new Date(y, m, 2), end: new Date(y, m, 16) },
        { open: new Date(y, m, 16, 13, 0), start: new Date(y, m, 17), end: new Date(y, m + 1, 1) }
      ].forEach(function (r) {
        // 측정 가능 기간과 겹치는 회차만
        if (r.end >= from && r.start <= to) {
          rounds.push({
            open: r.open,
            start: r.start < from ? from : r.start,
            end: r.end > to ? to : r.end
          });
        }
      });
      cursor = new Date(y, m + 1, 1);
    }
    return rounds;
  }

  /**
   * plan({ deadline: Date, validMonths: number|null, today: Date })
   * 반환: { ok, message, windowStart, windowEnd, rounds, trainingDays }
   */
  function plan(opts) {
    var today = atMidnight(opts.today || new Date());
    var deadline = atMidnight(opts.deadline);
    if (isNaN(deadline.getTime())) return { ok: false, message: "마감일(기준일)을 입력해 주세요." };

    var lastMeasure = addDays(deadline, -SAFETY_DAYS);
    var validFrom = opts.validMonths ? addMonths(deadline, -opts.validMonths) : null;
    var windowStart = addDays(today, 1);
    if (validFrom && validFrom > windowStart) windowStart = validFrom;

    if (lastMeasure < addDays(today, 1)) {
      return { ok: false, message: "마감까지 " + SAFETY_DAYS + "일도 남지 않았습니다. 이미 받은 인증서가 유효기간 안에 있는지 먼저 확인하세요." };
    }
    if (windowStart > lastMeasure) {
      return { ok: false, message: "유효기간 조건 때문에 아직 측정하면 안 됩니다. " + fmt(validFrom) + " 이후에 측정한 기록만 인정됩니다." };
    }

    var rounds = bookingRounds(windowStart, lastMeasure).filter(function (r) {
      return r.end >= windowStart;
    });
    var trainingDays = Math.round((lastMeasure - today) / DAY);

    return {
      ok: true,
      today: today,
      deadline: deadline,
      validFrom: validFrom,
      windowStart: windowStart,
      windowEnd: lastMeasure,
      rounds: rounds,
      trainingDays: trainingDays,
      safetyDays: SAFETY_DAYS
    };
  }

  var api = { plan: plan, bookingOpenFor: bookingOpenFor, fmt: fmt, addMonths: addMonths };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Schedule = api;
})(this);
