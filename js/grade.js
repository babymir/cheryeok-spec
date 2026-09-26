/*
 * 국민체력100 인증등급 계산 엔진
 * 근거: 문화체육관광부 고시 제2025-0027호 제6조 (2025-06-02 시행), 기준값은 data/criteria.json
 *
 * 규칙 요약 (성인 19~64세)
 *   1등급: 건강체력 4항목(심폐·근력·근지구력·유연성) 모두 1등급 기준 이상 + 운동체력(민첩·순발) 중 1개 1등급 기준 이상
 *   2등급: 같은 방식으로 2등급 기준
 *   3등급: 신체조성(BMI 또는 체지방률) 1개가 권장범위 + 건강체력 4항목 모두 3등급 기준 이상
 *   4등급: 심폐지구력과 근력이 모두 3등급 기준 이상
 *   5등급: 심폐지구력 또는 근력이 3등급 기준 이상
 *   6등급: 그 외
 * 어르신(65세 이상)
 *   1~3등급: 6개 항목(심폐·상지근·하지근·유연성·평형성·협응력) 모두 해당 등급 기준 이상
 *   4등급: 8자보행 + (절대악력 또는 의자앉았다일어서기)가 4등급 기준 이상
 *   5등급: 8자보행·절대악력·의자앉았다일어서기 중 1개가 5등급 기준 이상
 *
 * 브라우저에서는 window.GradeEngine, Node에서는 module.exports 로 쓴다.
 */
(function (root) {
  "use strict";

  var ADULT_AGES = [[19, 24], [25, 29], [30, 34], [35, 39], [40, 44], [45, 49], [50, 54], [55, 59], [60, 64]];
  var SENIOR_AGES = [[65, 69], [70, 74], [75, 79], [80, 84], [85, 200]];

  // 항목 묶음: 같은 체력요인 안에서 측정 방법을 하나 골라 잰다 (예: 심폐 = 20m 왕복 또는 트레드밀/스텝)
  var ADULT_FACTORS = {
    cardio: { label: "심폐지구력", items: ["shuttle20", "vo2max"], group: "health" },
    strength: { label: "근력", items: ["relGrip"], group: "health" },
    endurance: { label: "근지구력", items: ["crossSitup"], group: "health" },
    flexibility: { label: "유연성", items: ["sitReach"], group: "health" },
    agility: { label: "민첩성", items: ["run10x4", "reaction"], group: "motor" },
    power: { label: "순발력", items: ["longJump", "airTime"], group: "motor" }
  };
  var SENIOR_FACTORS = {
    cardio: { label: "심폐지구력", items: ["step2min", "walk6min"] },
    upper: { label: "상지근기능", items: ["relGrip"] },
    lower: { label: "하지근기능", items: ["chairStand"] },
    flexibility: { label: "유연성", items: ["sitReach"] },
    balance: { label: "평형성", items: ["tug3m"] },
    coordination: { label: "협응력", items: ["fig8"] }
  };

  function ageKey(age, ranges) {
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      if (age >= r[0] && age <= r[1]) {
        return r[1] >= 200 ? r[0] + "이상" : r[0] + "~" + r[1];
      }
    }
    return null;
  }

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  function meets(value, cutoff, direction) {
    return direction === "down" ? value <= cutoff : value >= cutoff;
  }

  /** 상대악력(%) = 좌우 중 높은 악력 ÷ 체중 × 100 (측정결과 API 값으로 검산해 확인) */
  function relativeGrip(gripLeft, gripRight, weight) {
    var best = Math.max(isNum(gripLeft) ? gripLeft : -1, isNum(gripRight) ? gripRight : -1);
    if (best < 0 || !isNum(weight) || weight <= 0) return null;
    return Math.round((best / weight) * 1000) / 10;
  }

  function inRange(value, range) {
    if (!isNum(value) || !range) return false;
    var okMin = range.minInclusive ? value >= range.min : value > range.min;
    var okMax = range.maxInclusive ? value <= range.max : value < range.max;
    return okMin && okMax;
  }

  function makeEngine(criteria) {
    if (!criteria || !criteria.adult || !criteria.senior) {
      throw new Error("인증기준 데이터(criteria.json)가 비어 있거나 형식이 다릅니다.");
    }

    function cutoff(table, grade, sex, key, item) {
      var g = table[String(grade)];
      if (!g || !g[sex] || !g[sex].byAge[key]) return null;
      var v = g[sex].byAge[key][item];
      return isNum(v) ? v : null;
    }

    function directionOf(item) {
      return criteria.items[item] ? criteria.items[item].direction : "up";
    }

    /** 한 항목이 도달한 최고 등급(1~3). 3등급 기준에도 못 미치면 null */
    function itemGrade(table, grades, sex, key, item, value) {
      if (!isNum(value)) return null;
      for (var i = 0; i < grades.length; i++) {
        var c = cutoff(table, grades[i], sex, key, item);
        if (c !== null && meets(value, c, directionOf(item))) return grades[i];
      }
      return null;
    }

    /** 체력요인(여러 측정 방법 중 입력된 것들) 안에서 가장 좋은 항목 결과를 고른다 */
    function factorResult(table, grades, sex, key, factor, input) {
      var best = null;
      factor.items.forEach(function (item) {
        var value = input[item];
        if (!isNum(value)) return;
        var g = itemGrade(table, grades, sex, key, item, value);
        var rank = g === null ? 99 : g;
        if (best === null || rank < best.rank) {
          best = { item: item, value: value, grade: g, rank: rank };
        }
      });
      return best; // null 이면 입력 없음
    }

    function gapTo(table, grade, sex, key, item, value) {
      var c = cutoff(table, grade, sex, key, item);
      if (c === null || !isNum(value)) return null;
      var dir = directionOf(item);
      if (meets(value, c, dir)) return 0;
      return Math.round(Math.abs(c - value) * 1000) / 1000;
    }

    function evaluateAdult(input, sex, key) {
      var table = criteria.adult;
      var grades = [1, 2, 3];
      var factors = {};
      Object.keys(ADULT_FACTORS).forEach(function (f) {
        factors[f] = factorResult(table, grades, sex, key, ADULT_FACTORS[f], input);
      });
      var missing = ["cardio", "strength", "endurance", "flexibility"].filter(function (f) { return !factors[f]; });

      function healthAllAt(g) {
        return ["cardio", "strength", "endurance", "flexibility"].every(function (f) {
          return factors[f] && factors[f].grade !== null && factors[f].grade <= g;
        });
      }
      function motorAnyAt(g) {
        return ["agility", "power"].some(function (f) {
          return factors[f] && factors[f].grade !== null && factors[f].grade <= g;
        });
      }
      var body = table["3"][sex].bodyComposition || {};
      var bodyOk = inRange(input.bmi, body.bmi) || inRange(input.bodyFat, body.bodyFat);
      var cardioOk = factors.cardio && factors.cardio.grade !== null;
      var strengthOk = factors.strength && factors.strength.grade !== null;

      var grade;
      if (healthAllAt(1) && motorAnyAt(1)) grade = 1;
      else if (healthAllAt(2) && motorAnyAt(2)) grade = 2;
      else if (bodyOk && healthAllAt(3)) grade = 3;
      else if (cardioOk && strengthOk) grade = 4;
      else if (cardioOk || strengthOk) grade = 5;
      else grade = 6;

      return { grade: grade, factors: factors, bodyOk: bodyOk, missing: missing };
    }

    function evaluateSenior(input, sex, key) {
      var table = criteria.senior;
      var factors = {};
      Object.keys(SENIOR_FACTORS).forEach(function (f) {
        factors[f] = factorResult(table, [1, 2, 3], sex, key, SENIOR_FACTORS[f], input);
      });
      var missing = Object.keys(SENIOR_FACTORS).filter(function (f) { return !factors[f]; });
      function allAt(g) {
        return Object.keys(SENIOR_FACTORS).every(function (f) {
          return factors[f] && factors[f].grade !== null && factors[f].grade <= g;
        });
      }
      function ok(grade, item) {
        var c = cutoff(table, grade, sex, key, item);
        return c !== null && isNum(input[item]) && meets(input[item], c, directionOf(item));
      }
      var grade;
      if (allAt(1)) grade = 1;
      else if (allAt(2)) grade = 2;
      else if (allAt(3)) grade = 3;
      else if (ok(4, "fig8") && (ok(4, "absGrip") || ok(4, "chairStand"))) grade = 4;
      else if (ok(5, "fig8") || ok(5, "absGrip") || ok(5, "chairStand")) grade = 5;
      else grade = 6;
      return { grade: grade, factors: factors, missing: missing };
    }

    /**
     * 목표 등급까지 모자란 항목 목록. 목표가 1~3등급일 때만 계산한다.
     * 반환: [{factor, label, item, value, cutoff, gap, direction}]
     */
    function gaps(result, targetGrade) {
      if (!(targetGrade >= 1 && targetGrade <= 3)) return [];
      var isAdult = result.group === "adult";
      var table = isAdult ? criteria.adult : criteria.senior;
      var defs = isAdult ? ADULT_FACTORS : SENIOR_FACTORS;
      var list = [];
      var needFactors = Object.keys(defs).filter(function (f) {
        return !isAdult || defs[f].group === "health";
      });
      needFactors.forEach(function (f) {
        var r = result.factors[f];
        if (!r) {
          list.push({ factor: f, label: defs[f].label, item: defs[f].items[0], value: null, cutoff: cutoff(table, targetGrade, result.sex, result.ageKey, defs[f].items[0]), gap: null, direction: directionOf(defs[f].items[0]) });
          return;
        }
        var gap = gapTo(table, targetGrade, result.sex, result.ageKey, r.item, r.value);
        if (gap > 0) {
          list.push({ factor: f, label: defs[f].label, item: r.item, value: r.value, cutoff: cutoff(table, targetGrade, result.sex, result.ageKey, r.item), gap: gap, direction: directionOf(r.item) });
        }
      });
      // 성인 1·2등급은 운동체력 중 하나만 넘으면 된다 → 둘 다 모자랄 때만 덜 모자란 쪽 하나를 보여준다
      if (isAdult && targetGrade <= 2) {
        var motor = ["agility", "power"].map(function (f) {
          var r = result.factors[f];
          if (!r) return null;
          var gap = gapTo(table, targetGrade, result.sex, result.ageKey, r.item, r.value);
          var c = cutoff(table, targetGrade, result.sex, result.ageKey, r.item);
          return { factor: f, label: ADULT_FACTORS[f].label, item: r.item, value: r.value, cutoff: c, gap: gap, direction: directionOf(r.item), ratio: c ? gap / c : 1 };
        }).filter(Boolean);
        var passed = motor.some(function (m) { return m.gap === 0; });
        if (!passed) {
          if (motor.length === 0) {
            list.push({ factor: "agility", label: "민첩성 또는 순발력", item: "longJump", value: null, cutoff: cutoff(table, targetGrade, result.sex, result.ageKey, "longJump"), gap: null, direction: "up", oneOf: true });
          } else {
            motor.sort(function (a, b) { return a.ratio - b.ratio; });
            motor[0].oneOf = true;
            list.push(motor[0]);
          }
        }
      }
      if (isAdult && targetGrade === 3 && !result.bodyOk) {
        list.push({ factor: "body", label: "신체조성(BMI 또는 체지방률)", item: "bmi", value: result.input.bmi, cutoff: null, gap: null, direction: "range" });
      }
      return list;
    }

    /**
     * 메인 함수
     * input: { sex: "M"|"F", age, height, weight, bodyFat, gripLeft, gripRight, shuttle20, vo2max, crossSitup,
     *          sitReach, run10x4, reaction, longJump, airTime, step2min, walk6min, chairStand, tug3m, fig8 }
     */
    function evaluate(raw) {
      var input = {};
      Object.keys(raw).forEach(function (k) { input[k] = raw[k]; });
      if (input.sex !== "M" && input.sex !== "F") throw new Error("성별을 선택해 주세요.");
      if (!isNum(input.age)) throw new Error("나이를 입력해 주세요.");
      if (input.age < 19) throw new Error("이 서비스는 만 19세 이상(성인·어르신)만 계산합니다.");

      if (!isNum(input.relGrip)) input.relGrip = relativeGrip(input.gripLeft, input.gripRight, input.weight);
      if (!isNum(input.absGrip)) {
        var g = Math.max(isNum(input.gripLeft) ? input.gripLeft : -1, isNum(input.gripRight) ? input.gripRight : -1);
        input.absGrip = g >= 0 ? g : null;
      }
      if (!isNum(input.bmi) && isNum(input.height) && isNum(input.weight) && input.height > 0) {
        input.bmi = Math.round((input.weight / Math.pow(input.height / 100, 2)) * 10) / 10;
      }

      var group = input.age >= 65 ? "senior" : "adult";
      var key = ageKey(input.age, group === "adult" ? ADULT_AGES : SENIOR_AGES);
      var r = group === "adult" ? evaluateAdult(input, input.sex, key) : evaluateSenior(input, input.sex, key);
      r.group = group;
      r.sex = input.sex;
      r.ageKey = key;
      r.input = input;
      return r;
    }

    return {
      evaluate: evaluate,
      gaps: gaps,
      cutoff: function (group, grade, sex, key, item) {
        return cutoff(group === "adult" ? criteria.adult : criteria.senior, grade, sex, key, item);
      },
      ageKey: function (age) {
        return age >= 65 ? ageKey(age, SENIOR_AGES) : ageKey(age, ADULT_AGES);
      },
      factorsOf: function (group) {
        return group === "adult" ? ADULT_FACTORS : SENIOR_FACTORS;
      },
      directionOf: directionOf,
      relativeGrip: relativeGrip
    };
  }

  var api = { makeEngine: makeEngine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GradeEngine = api;
})(this);
