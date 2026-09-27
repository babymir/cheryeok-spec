/*
 * 채용 담당자 화면과 데이터 출처 화면
 *   1) 요구 등급별 연령·성별 통과율  2) 예상 지원자 중 남는 인원  3) 공고문 안내 문구
 * 입력 데이터: data/stats.json (scripts/build_stats.js 가 측정결과 API 기록으로 만든다),
 *             data/quick.json, data/validation.json, data/jobs.json
 */
(function (root) {
  "use strict";

  var h = root.Dom.h;
  var mount = root.Dom.mount;
  var link = root.Dom.link;

  var TARGETS = ["1", "2", "3", "4"];
  var RESERVE_SITE = "국민체력100 누리집(nfa.kspo.or.kr)";
  // 성인 등급 판정 조건 (문화체육관광부 고시 제2025-0027호 제6조, js/grade.js 와 같은 규칙)
  var RULE_TEXT = {
    1: "1등급은 건강체력 4개 항목(심폐지구력·근력·근지구력·유연성)이 모두 1등급 기준 이상이고, 운동체력(민첩성·순발력) 중 1개도 1등급 기준 이상이어야 합니다.",
    2: "2등급 이상은 건강체력 4개 항목(심폐지구력·근력·근지구력·유연성)이 모두 2등급 기준 이상이고, 운동체력(민첩성·순발력) 중 1개도 2등급 기준 이상이어야 합니다.",
    3: "3등급 이상은 건강체력 4개 항목(심폐지구력·근력·근지구력·유연성)이 모두 3등급 기준 이상이고, 신체조성(BMI 또는 체지방률)이 권장범위 안이어야 합니다.",
    4: "4등급 이상은 심폐지구력과 근력이 모두 3등급 기준 이상이어야 합니다."
  };
  // 지원자 구성 예시: 계산을 보여 주기 위한 가정값이다 (실제 지원자 통계 아님)
  var POOL_PRESETS = [
    { name: "청원경찰·특수경비 (예시)", from: "19~24", to: "35~39", male: 85 },
    { name: "환경공무관·미화 (예시)", from: "30~34", to: "55~59", male: 90 },
    { name: "공무직·공원 기간제 (예시)", from: "40~44", to: "60~64", male: 60 },
    { name: "항공 객실승무원 (예시)", from: "19~24", to: "25~29", male: 20 },
    { name: "직접 입력", custom: true }
  ];

  function $(id) { return document.getElementById(id); }

  function pct(v) {
    return v === null || v === undefined || !isFinite(v) ? "-" : (v * 100).toFixed(1) + "%";
  }

  function pct2(v) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    var x = (v * 100).toFixed(2);
    if (x === "100.00" && v < 1) x = "99.99"; // 100% 에 못 미치는 값을 100% 로 보이지 않게
    return x + "%";
  }

  function groupName(g) {
    return g === "adult" ? "성인" : "어르신";
  }

  function bandName(b) {
    return b.ageKey + "세 " + (b.sex === "M" ? "남" : "여");
  }

  function bar(rate, n, minN) {
    return h("div", { class: "bar" + (n < minN ? " thin" : "") },
      h("i", { style: "width:" + Math.round(rate * 100) + "%" }),
      h("span", null, pct(rate), " ", h("small", null, "n=" + n.toLocaleString())));
  }

  function drawEmployer(stats) {
    var target = $("emp-grade").value;
    var solid = stats.bands.filter(function (b) { return b.n >= stats.minBandN; });
    var sorted = solid.slice().sort(function (a, b) { return a.passRate[target] - b.passRate[target]; });
    var low = sorted[0];
    var high = sorted[sorted.length - 1];

    mount($("emp-summary"),
      h("div", { class: "kpis" },
        h("div", { class: "kpi" }, h("small", null, "전체 통과율"), h("b", null, pct(stats.overall.passRate[target]))),
        low ? h("div", { class: "kpi" }, h("small", null, "가장 낮은 집단"), h("b", null, pct(low.passRate[target])), h("span", null, bandName(low))) : null,
        high ? h("div", { class: "kpi" }, h("small", null, "가장 높은 집단"), h("b", null, pct(high.passRate[target])), h("span", null, bandName(high))) : null),
      h("p", { class: "hint" }, "기준: " + stats.period + " 국민체력100 측정 " + stats.overall.n.toLocaleString() +
        "건('참가' 제외). 측정하러 온 사람 기준이라 전체 국민과 다를 수 있습니다. 표본 " + stats.minBandN + "명 미만 집단은 흐리게 표시했습니다."));

    var tables = ["adult", "senior"].map(function (g) {
      var bands = stats.bands.filter(function (b) { return b.group === g; });
      if (!bands.length) return null;
      var ages = [];
      bands.forEach(function (b) { if (ages.indexOf(b.ageKey) < 0) ages.push(b.ageKey); });
      return h("div", null,
        h("h3", { class: "sub" }, groupName(g)),
        h("table", { class: "grid bars" },
          h("thead", null, h("tr", null, h("th", null, "연령"), h("th", null, "남"), h("th", null, "여"))),
          h("tbody", null, ages.map(function (age) {
            return h("tr", null, h("td", null, age), ["M", "F"].map(function (sex) {
              var b = bands.filter(function (x) { return x.ageKey === age && x.sex === sex; })[0];
              return h("td", null, b ? bar(b.passRate[target], b.n, stats.minBandN) : "-");
            }));
          }))));
    });
    mount($("emp-table"), tables);

    var reasons = stats.failReasons[target];
    if (!reasons) {
      mount($("emp-reasons"));
      return;
    }
    mount($("emp-reasons"),
      h("h3", { class: "sub" }, "떨어진 사람은 어떤 항목에서 걸렸나"),
      Object.keys(reasons).map(function (g) {
        var r = reasons[g];
        return h("div", { class: "reason-block" },
          h("p", null, h("b", null, groupName(g)), " 미달자 " + r.n.toLocaleString() + "명 중 ",
            h("b", null, "딱 한 항목만 모자란 사람 " + pct(r.single / r.n))),
          h("ul", { class: "reason-list" }, r.top.map(function (t) {
            return h("li", null, t.label + " ", h("b", null, pct(t.count / r.n)));
          })));
      }),
      h("p", { class: "hint" }, "여러 항목이 동시에 모자랄 수 있어 합계가 100%를 넘습니다."));
  }

  // ---------- 2. 예상 지원자 중 남는 인원 ----------
  function adultAges(stats) {
    var ages = [];
    stats.bands.forEach(function (b) { if (b.group === "adult" && ages.indexOf(b.ageKey) < 0) ages.push(b.ageKey); });
    return ages.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
  }

  /** 고른 연령대 안에서 성별 통과율 (연령대별 측정 인원으로 가중 평균) */
  function poolRates(stats, ages, sex) {
    var bands = stats.bands.filter(function (b) { return b.group === "adult" && b.sex === sex && ages.indexOf(b.ageKey) >= 0; });
    var n = bands.reduce(function (s, b) { return s + b.n; }, 0);
    var rates = {};
    TARGETS.forEach(function (t) {
      rates[t] = n ? bands.reduce(function (s, b) { return s + b.n * b.passRate[t]; }, 0) / n : null;
    });
    return { n: n, rates: rates, bands: bands };
  }

  function drawPool(stats) {
    var ages = adultAges(stats);
    var from = ages.indexOf($("pool-from").value);
    var to = ages.indexOf($("pool-to").value);
    var total = Number($("pool-n").value);
    var male = Number($("pool-male").value);
    if (from < 0 || to < 0 || from > to) {
      mount($("pool-result"), h("p", { class: "error" }, "연령 범위를 다시 골라 주세요 (부터 ≤ 까지)."));
      return;
    }
    if (!(total > 0) || !(male >= 0 && male <= 100)) {
      mount($("pool-result"), h("p", { class: "error" }, "지원자 수는 1명 이상, 남성 비율은 0~100 사이로 넣어 주세요."));
      return;
    }
    var picked = ages.slice(from, to + 1);
    var m = poolRates(stats, picked, "M");
    var f = poolRates(stats, picked, "F");
    var share = male / 100;
    var rows = TARGETS.map(function (t) {
      var parts = [];
      if (share > 0 && m.rates[t] !== null) parts.push([share, m.rates[t]]);
      if (share < 1 && f.rates[t] !== null) parts.push([1 - share, f.rates[t]]);
      var w = parts.reduce(function (s, p) { return s + p[0]; }, 0);
      var rate = w ? parts.reduce(function (s, p) { return s + p[0] * p[1]; }, 0) / w : null;
      var low = m.bands.concat(f.bands).filter(function (b) { return b.n >= stats.minBandN; })
        .filter(function (b) { return (b.sex === "M" ? share : 1 - share) > 0; })
        .sort(function (a, b) { return a.passRate[t] - b.passRate[t]; })[0];
      return h("tr", null,
        h("td", null, t === "1" ? "1등급" : t + "등급 이상"),
        h("td", null, h("b", null, rate === null ? "-" : Math.round(total * rate).toLocaleString() + "명"), h("small", null, pct(rate))),
        h("td", null, share > 0 ? pct(m.rates[t]) : "-"),
        h("td", null, share < 1 ? pct(f.rates[t]) : "-"),
        h("td", null, low ? bandName(low) + " " + pct(low.passRate[t]) : "-"));
    });
    mount($("pool-result"),
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null, h("th", null, "요구 등급"), h("th", null, "지원자 " + total.toLocaleString() + "명 중 통과"),
          h("th", null, "남성 통과율"), h("th", null, "여성 통과율"), h("th", null, "가장 낮은 집단"))),
        h("tbody", null, rows))),
      h("p", { class: "hint" }, "계산: " + parseInt(picked[0], 10) + "~" + picked[picked.length - 1].split("~")[1] + "세 측정자(남 " + m.n.toLocaleString() + "명, 여 " + f.n.toLocaleString() +
        "명)의 실제 통과율을 연령대별 인원으로 가중 평균했습니다. 지원자의 체력이 측정하러 온 사람들과 비슷하다고 가정한 값이라 실제와 다를 수 있습니다."));
  }

  function renderPool(stats) {
    var ages = adultAges(stats);
    var ageOpts = function (sel) { return ages.map(function (a) { return h("option", { value: a, selected: a === sel }, a + "세"); }); };
    mount($("pool-preset"), POOL_PRESETS.map(function (p, i) { return h("option", { value: String(i) }, p.name); }));
    mount($("pool-from"), ageOpts(POOL_PRESETS[0].from));
    mount($("pool-to"), ageOpts(POOL_PRESETS[0].to));
    $("pool-male").value = POOL_PRESETS[0].male;
    $("pool-preset").addEventListener("change", function () {
      var p = POOL_PRESETS[Number($("pool-preset").value)];
      if (!p.custom) {
        $("pool-from").value = p.from;
        $("pool-to").value = p.to;
        $("pool-male").value = p.male;
      }
      drawPool(stats);
    });
    ["pool-n", "pool-from", "pool-to", "pool-male"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        if (id !== "pool-n") $("pool-preset").value = String(POOL_PRESETS.length - 1);
        drawPool(stats);
      });
    });
    drawPool(stats);
  }

  // ---------- 3. 공고문 안내 문구 ----------
  function drawNotice() {
    var S = root.Schedule;
    var grade = Number($("notice-grade").value);
    var months = Number($("notice-valid").value);
    var dueValue = $("notice-due").value;
    if (!dueValue) {
      mount($("notice-result"), h("p", { class: "hint" }, "인증서 제출 마감일을 넣으면 문구를 만듭니다."));
      return;
    }
    var p = dueValue.split("-").map(Number);
    var due = new Date(p[0], p[1] - 1, p[2]);
    var from = S.addMonths(due, -months);
    var plan = S.plan({ deadline: due, validMonths: months, today: new Date() });
    var gradeText = grade === 1 ? "종합 1등급" : "종합 " + grade + "등급 이상";
    var lines = [
      "■ 국민체력100 체력인증 제출 안내",
      "- 인정 등급: " + gradeText + " (국민체력100 체력인증, 문화체육관광부 고시 제2025-0027호 기준)",
      "- 인정 기간: " + S.fmt(from) + " 이후 측정분 (인증서 제출 마감일 " + S.fmt(due) + " 기준 " + (months === 12 ? "1년" : months + "개월") + " 이내)",
      "- 측정 예약: " + RESERVE_SITE + "에서 매월 1일 13시(2~16일 측정분)와 16일 13시(17일~다음 달 1일 측정분)에 예약이 열리며, 인기 센터는 수 분 안에 마감됩니다."
    ];
    if (plan.ok && plan.rounds.length) {
      var last = plan.rounds[plan.rounds.length - 1];
      lines.push("- 인증서 발급·제출 준비 기간을 고려해 늦어도 " + S.fmt(last.open) + " 13시에 열리는 예약 회차(측정 " + S.fmt(last.start) + " ~ " + S.fmt(last.end) + ")까지 측정을 마치시기 바랍니다.");
    }
    lines.push("- 참고(성인 기준): " + RULE_TEXT[grade] + " 한 항목이라도 기준에 못 미치면 등급이 내려가니 미리 준비하시기 바랍니다.");
    var text = lines.join("\n");
    var copyBtn = h("button", { type: "button", class: "small-btn" }, "문구 복사");
    copyBtn.addEventListener("click", function () {
      if (!navigator.clipboard) {
        copyBtn.textContent = "복사가 안 되는 브라우저입니다. 직접 선택해 복사하세요.";
        return;
      }
      navigator.clipboard.writeText(text).then(function () { copyBtn.textContent = "복사했습니다"; },
        function () { copyBtn.textContent = "복사하지 못했습니다. 직접 선택해 복사하세요."; });
    });
    mount($("notice-result"),
      plan.ok ? null : h("p", { class: "error" }, plan.message),
      h("pre", { class: "notice-text" }, text), copyBtn);
  }

  function renderNotice() {
    ["notice-grade", "notice-valid", "notice-due"].forEach(function (id) { $(id).addEventListener("change", drawNotice); });
    drawNotice();
  }

  function renderEmployer(data) {
    if (!data.stats) {
      mount($("emp-summary"), h("p", { class: "hint" }, "통과율 데이터를 준비하고 있습니다."));
      return;
    }
    $("emp-grade").addEventListener("change", function () { drawEmployer(data.stats); });
    drawEmployer(data.stats);
    renderPool(data.stats);
    renderNotice();
  }

  function renderAbout(data) {
    var v = data.validation;
    var s = data.stats;
    var q = data.quick;
    var validation = v && v.stats ? h("li", null, "등급 계산 검증: 측정결과 API의 실제 인증등급과 이 서비스의 계산을 비교 — " +
      Object.keys(v.stats).map(function (g) {
        var x = v.stats[g];
        return g + " " + x.total.toLocaleString() + "건 중 등급 " + pct2(x.exact / x.total) + " 일치(3등급 이상 여부 " + pct2(x.sameBand / x.total) + ")";
      }).join(", ") + " (" + v.checkedAt + " 확인). 어르신 불일치는 4~6등급 구분에서만 생기며 대부분 85세 이상입니다.") : null;
    var quickCheck = q ? h("li", null, "간이 진단 검증: " + q.period.split(" ~ ")[0] + " ~ 2026.5 성인 기록 " + q.validation.trainN.toLocaleString() +
      "건으로 조건별 통과율표를 만들고, 표에 쓰지 않은 2026.6 이후 기록 " + q.validation.result["3"].covered.toLocaleString() + "건에 적용 — " +
      TARGETS.map(function (t) { return (t === "1" ? "1등급" : t + "등급 이상") + " " + pct(q.validation.result[t].accuracy); }).join(", ") +
      " 맞힘. 화면의 표는 전체 기록 " + q.adultN.toLocaleString() + "건으로 만듭니다.") : null;
    var nm = q ? q.nearMiss : null;
    var nearMiss = nm ? h("li", null, "아깝게 떨어진 사람: 3등급 미달 성인 " + nm.failN.toLocaleString() + "명 중 한 항목만 모자란 사람 " +
      nm.singleN.toLocaleString() + "명(" + pct(nm.singleN / nm.failN) + "). 부족량 중앙값 — " +
      nm.items.filter(function (i) { return i.median !== null; }).map(function (i) {
        return i.label + "(" + (data.criteria.items[i.item] ? data.criteria.items[i.item].label : i.item) + ") " + i.median + (data.criteria.items[i.item] ? data.criteria.items[i.item].unit : "") + " (" + i.n.toLocaleString() + "명)";
      }).join(", ") + ". 기록이 비어 있어 부족량을 알 수 없는 " + nm.unknownN.toLocaleString() + "명은 뺐습니다.") : null;

    mount($("about"),
      h("h3", { class: "sub" }, "국민체육진흥공단 공공데이터 (공공데이터포털)"),
      h("ul", { class: "plain" },
        h("li", null, link("https://www.data.go.kr/data/15108938/openapi.do", "국민체력100 체력인증센터 측정결과 정보"),
          " — 등급 계산 검증, 간이 진단 통과율표, 동년배 백분위, 연령·성별 통과율" + (s ? " (" + s.period + ", " + s.overall.n.toLocaleString() + "건)" : "")),
        h("li", null, link("https://www.data.go.kr/data/15108846/openapi.do", "국민체력100 동영상 정보"),
          " — 모자란 항목별 운동 영상 " + data.videos.length + "개"),
        h("li", null, link("https://www.data.go.kr/data/15114286/openapi.do", "국민체력100 체력인증센터 측정건수 정보"),
          " — 운영 센터 " + data.centers.length + "곳, 달별 혼잡도"),
        h("li", null, link(data.criteria.source, "국민체력100 인증기준"), " — 성별·연령별 등급 기준값")),
      h("h3", { class: "sub" }, "계산 근거와 검증"),
      h("ul", { class: "plain" },
        h("li", null, "등급 판정 규칙: " + data.criteria.rule),
        validation,
        quickCheck,
        nearMiss,
        h("li", null, "상대악력 = 좌우 중 높은 악력 ÷ 몸무게 × 100 (측정결과 API 값으로 확인)"),
        h("li", null, "채용공고 " + data.jobs.jobs.length + "건: 공고 원문·보도로 확인 (" + data.jobs.updated + " 기준). 확인하지 못한 칸은 '공고 확인'으로 표시합니다.")),
      h("h3", { class: "sub" }, "한계"),
      h("ul", { class: "plain" },
        h("li", null, "통과율은 '센터에 측정하러 온 사람' 기준입니다. 전체 국민이나 실제 지원자와 다를 수 있습니다."),
        h("li", null, "간이 진단의 정확도는 센터에서 잰 기록으로 확인한 값입니다. 집에서 잰 기록은 더 좋게 나오기 쉬워 실제 정확도는 낮을 수 있습니다."),
        h("li", null, "같은 사람이 여러 번 측정한 기록을 구분할 수 없어(개인 식별값 없음) 한 사람이 여러 번 세어졌을 수 있습니다.")),
      h("p", { class: "hint" }, "이 서비스의 계산은 참고용입니다. 공식 등급은 체력인증센터 측정으로만 정해집니다."));
  }

  root.Employer = {
    render: function (data) {
      renderEmployer(data);
      renderAbout(data);
    }
  };
})(this);
