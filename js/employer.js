/*
 * 채용 담당자 화면(요구 등급별 연령·성별 통과율)과 데이터 출처 화면
 * 입력 데이터: data/stats.json (scripts/build_stats.js 가 측정결과 API 기록으로 만든다), data/validation.json
 */
(function (root) {
  "use strict";

  var h = root.Dom.h;
  var mount = root.Dom.mount;
  var link = root.Dom.link;

  function $(id) { return document.getElementById(id); }

  function pct(v) {
    return v === null || v === undefined || !isFinite(v) ? "-" : Math.round(v * 1000) / 10 + "%";
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

  function renderEmployer(data) {
    if (!data.stats) {
      mount($("emp-summary"), h("p", { class: "hint" }, "통과율 데이터를 준비하고 있습니다."));
      return;
    }
    $("emp-grade").addEventListener("change", function () { drawEmployer(data.stats); });
    drawEmployer(data.stats);
  }

  function renderAbout(data) {
    var v = data.validation;
    var s = data.stats;
    var validation = v && v.stats ? h("li", null, "검증: 측정결과 API의 실제 인증등급과 이 서비스의 계산을 비교 — " +
      Object.keys(v.stats).map(function (g) {
        var x = v.stats[g];
        return g + " " + x.total.toLocaleString() + "건 중 " + pct(x.exact / x.total) + " 일치";
      }).join(", ") + " (" + v.checkedAt + " 확인)") : null;

    mount($("about"),
      h("h3", { class: "sub" }, "국민체육진흥공단 공공데이터 (공공데이터포털)"),
      h("ul", { class: "plain" },
        h("li", null, link("https://www.data.go.kr/data/15108938/openapi.do", "국민체력100 체력인증센터 측정결과 정보"),
          " — 등급 계산 검증, 연령·성별 통과율" + (s ? " (" + s.period + ", " + s.overall.n.toLocaleString() + "건)" : "")),
        h("li", null, link("https://www.data.go.kr/data/15108846/openapi.do", "국민체력100 동영상 정보"),
          " — 모자란 항목별 운동 영상 " + data.videos.length + "개"),
        h("li", null, link("https://www.data.go.kr/data/15114286/openapi.do", "국민체력100 체력인증센터 측정건수 정보"),
          " — 운영 센터 " + data.centers.length + "곳, 달별 혼잡도"),
        h("li", null, link(data.criteria.source, "국민체력100 인증기준"), " — 성별·연령별 등급 기준값")),
      h("h3", { class: "sub" }, "계산 근거"),
      h("ul", { class: "plain" },
        h("li", null, "등급 판정 규칙: " + data.criteria.rule),
        validation,
        h("li", null, "상대악력 = 좌우 중 높은 악력 ÷ 몸무게 × 100 (측정결과 API 값으로 확인)"),
        h("li", null, "채용공고 " + data.jobs.jobs.length + "건: 공고 원문·보도로 확인 (" + data.jobs.updated + " 기준)")),
      h("p", { class: "hint" }, "이 서비스의 계산은 참고용입니다. 공식 등급은 체력인증센터 측정으로만 정해집니다."));
  }

  root.Employer = {
    render: function (data) {
      renderEmployer(data);
      renderAbout(data);
    }
  };
})(this);
