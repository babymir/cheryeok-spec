/*
 * 집에서 하는 간이 진단 — 계산만 담당 (화면은 app.js)
 *
 * 원리: 성별·연령대·윗몸일으키기 수준·유연성 수준·BMI 범위가 나와 같았던 실제 측정자 중
 *       목표 등급 이상을 받은 비율을 data/quick.json 의 표에서 찾는다. (scripts/build_quick.js 가 만든다)
 *   수준: 1·2·3 = 그 등급 기준 이상, 0 = 3등급 기준 미달
 *   칸 인원이 적으면(minCellN 미만) 연령대를 합친 칸('*')을 쓴다.
 * 백분위: 같은 성별·연령대 측정자 중 내 기록이 어디쯤인지 (5% 단위, 대략값)
 *
 * 브라우저에서는 window.Quick, Node 에서는 module.exports 로 쓴다.
 */
(function (root) {
  "use strict";

  var HOME_ITEMS = ["crossSitup", "sitReach"]; // 장비 없이 집에서 잴 수 있는 두 항목

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  function makeQuick(quick, engine, criteria) {
    if (!quick || !quick.cells || !quick.percentiles) {
      throw new Error("간이 진단 데이터(quick.json)가 비어 있거나 형식이 다릅니다.");
    }
    var bmiRange = criteria.adult["3"].M.bodyComposition.bmi;

    /** 한 항목의 수준 (1·2·3, 미달 0) */
    function levelOf(sex, ageKey, item, value) {
      var dir = engine.directionOf(item);
      for (var g = 1; g <= 3; g++) {
        var c = engine.cutoff("adult", g, sex, ageKey, item);
        if (c !== null && (dir === "down" ? value <= c : value >= c)) return g;
      }
      return 0;
    }

    function bmiOk(bmi) {
      var okMin = bmiRange.minInclusive ? bmi >= bmiRange.min : bmi > bmiRange.min;
      var okMax = bmiRange.maxInclusive ? bmi <= bmiRange.max : bmi < bmiRange.max;
      return okMin && okMax ? 1 : 0;
    }

    /** 표에서 칸 찾기. 반환 {n, rate, pooled} 또는 null */
    function lookup(sex, ageKey, su, fl, bmi, target) {
      var tail = [su, fl, bmi].join("|");
      var keys = [sex + "|" + ageKey + "|" + tail, sex + "|*|" + tail];
      for (var i = 0; i < keys.length; i++) {
        var cell = quick.cells[keys[i]];
        if (cell && cell[0] >= quick.minCellN) {
          return { n: cell[0], passed: cell[target], rate: cell[target] / cell[0], pooled: i === 1 };
        }
      }
      return null;
    }

    /**
     * 백분위: 같은 성별·연령대에서 나보다 기록이 나쁜 사람의 비율(%). 좋을수록 큼.
     * 반환 {better: 상위 몇 %, n} 또는 null
     */
    function percentile(group, sex, ageKey, item, value) {
      var band = quick.percentiles[group + "|" + sex + "|" + ageKey];
      var p = band && band[item];
      if (!p || !isNum(value)) return null;
      var below = 0; // value 보다 작은 분위수 개수
      for (var i = 0; i < p.q.length; i++) if (p.q[i] < value) below++;
      var pctBelow = below * quick.percentileStep; // 나보다 값이 작은 사람 비율(대략)
      var up = engine.directionOf(item) !== "down";
      var worse = up ? pctBelow : 100 - pctBelow;
      var top = Math.max(quick.percentileStep, 100 - worse);
      return { top: Math.min(100, top), n: p.n };
    }

    /**
     * 간이 진단
     * input: { sex, age, height, weight, crossSitup, sitReach }, target: 1~4
     * 반환: { ok, message } 또는 { ok, ageKey, items[], bmi, bmiOk, now, ifFixed }
     */
    function diagnose(input, target) {
      if (input.sex !== "M" && input.sex !== "F") return { ok: false, message: "성별을 선택해 주세요." };
      if (!isNum(input.age)) return { ok: false, message: "나이를 입력해 주세요." };
      if (input.age < 19) return { ok: false, message: "만 19세 이상만 계산합니다." };
      if (input.age >= 65) return { ok: false, senior: true, message: "65세 이상은 측정항목이 달라 간이 진단을 지원하지 않습니다. '전체 기록 입력'을 쓰세요. 어르신 항목은 대부분 집에서 잴 수 있습니다." };
      if (!isNum(input.height) || !isNum(input.weight) || input.height < 100 || input.weight < 25) {
        return { ok: false, message: "키와 몸무게를 넣어 주세요. BMI(체질량지수)가 3등급 조건에 들어갑니다." };
      }
      var missing = HOME_ITEMS.filter(function (k) { return !isNum(input[k]); });
      if (missing.length) return { ok: false, message: "윗몸일으키기 횟수와 유연성 기록을 모두 넣어 주세요." };

      var ageKey = engine.ageKey(input.age);
      var bmi = Math.round((input.weight / Math.pow(input.height / 100, 2)) * 10) / 10;
      var bmiIn = bmiOk(bmi);
      var need = Math.min(target, 3); // 윗몸·유연성이 넘어야 하는 등급 (4등급은 이 둘을 안 봄)

      var items = HOME_ITEMS.map(function (item) {
        var level = levelOf(input.sex, ageKey, item, input[item]);
        var cutoff = engine.cutoff("adult", need, input.sex, ageKey, item);
        var short = target <= 3 && (level === 0 || level > need);
        return {
          item: item, value: input[item], level: level, cutoff: cutoff, short: short,
          gap: short && cutoff !== null ? Math.round(Math.abs(cutoff - input[item]) * 10) / 10 : 0,
          percentile: percentile("adult", input.sex, ageKey, item, input[item]),
          percentileAtCutoff: cutoff !== null ? percentile("adult", input.sex, ageKey, item, cutoff) : null
        };
      });
      var levels = items.map(function (i) { return i.level; });
      var now = lookup(input.sex, ageKey, levels[0], levels[1], bmiIn, target);

      // 모자란 항목을 기준까지 올렸다면 (BMI 는 그대로)
      var ifFixed = null;
      if (items.some(function (i) { return i.short; })) {
        var fixed = items.map(function (i) { return i.short ? need : i.level; });
        ifFixed = lookup(input.sex, ageKey, fixed[0], fixed[1], bmiIn, target);
      }
      return { ok: true, ageKey: ageKey, target: target, items: items, bmi: bmi, bmiOk: bmiIn === 1, now: now, ifFixed: ifFixed };
    }

    return { diagnose: diagnose, percentile: percentile, validation: quick.validation, period: quick.period, adultN: quick.adultN, nearMiss: quick.nearMiss };
  }

  var api = { makeQuick: makeQuick, HOME_ITEMS: HOME_ITEMS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Quick = api;
})(this);
