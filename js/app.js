/*
 * 체력스펙 — 첫 화면, 지원자 화면(공고 선택 → 기록 입력 → 결과 → 일정 → 센터), 탭 전환
 * 계산은 grade.js(등급), quick.js(간이 진단), schedule.js(일정), jobs.js(공고)에 맡기고 여기서는 화면만 그린다.
 * 채용 담당자·데이터 출처 화면은 employer.js, 채용공고 탭은 jobs.js 에 있다.
 */
(function () {
  "use strict";

  var h = window.Dom.h;
  var mount = window.Dom.mount;
  var link = window.Dom.link;

  var DATA_FILES = {
    criteria: "data/criteria.json",
    jobs: "data/jobs.json",
    videos: "data/videos.json",
    centers: "data/centers.json",
    quick: "data/quick.json",
    stats: "data/stats.json",
    validation: "data/validation.json"
  };
  var OPTIONAL = { stats: true, validation: true };
  var VIDEOS_PER_ITEM = 3;
  var MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  var DEFAULT_REGION = "서울";
  var RESERVE_URL = "https://nfa.kspo.or.kr/reserve/selectReserveStep1.kspo";
  var HOME_MARGIN = "집에서 잰 기록은 센터보다 좋게 나오기 쉽습니다. 기준보다 윗몸일으키기 2~3회, 유연성 1~2cm 여유를 두세요.";
  // 간이 진단 항목 → 등급 엔진 체력요인 (영상 추천에 쓴다)
  var QUICK_FACTOR = { crossSitup: "endurance", sitReach: "flexibility" };
  var QUICK_HOW = {
    crossSitup: "누워서 무릎을 세우고 두 손을 머리 뒤에. 팔꿈치로 반대쪽 무릎을 번갈아 닿게 1분 동안 센 횟수",
    sitReach: "벽에 발바닥을 붙이고 다리를 편 채 앉아 두 손을 모아 앞으로 굽힘. 발끝이 0cm, 발끝을 넘으면 +, 못 미치면 −"
  };

  var state = { data: {}, engine: null, quick: null, job: null, validFrom: null };

  // ---------- 공통 도우미 ----------
  function $(id) { return document.getElementById(id); }

  function num(v) {
    if (v === "" || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function fmtNum(v, unit) {
    if (v === null || v === undefined) return "-";
    return Math.round(v * 1000) / 1000 + (unit ? " " + unit : "");
  }

  function pct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return (v * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function unitOf(item) {
    var it = state.data.criteria.items[item];
    return it ? it.unit : "";
  }

  function labelOf(item) {
    var it = state.data.criteria.items[item];
    return it ? it.label : "";
  }

  function sexName(sex) { return sex === "M" ? "남성" : "여성"; }

  function errorBox(message) {
    return h("p", { class: "error" }, message);
  }

  /** 백분위 → "상위 35%" 같은 말 */
  function rankText(p) {
    if (!p) return "-";
    if (p.top <= 5) return "100명 중 5등 안";
    if (p.top >= 100) return "100명 중 95등 밖";
    return "100명 중 약 " + p.top + "등";
  }

  function loadJson(key) {
    return fetch(DATA_FILES[key], { cache: "no-cache" }).then(function (res) {
      if (!res.ok) {
        if (OPTIONAL[key]) return null;
        throw new Error(DATA_FILES[key] + " 파일을 불러오지 못했습니다 (" + res.status + ")");
      }
      return res.json();
    }).catch(function (e) {
      if (OPTIONAL[key]) return null;
      throw e;
    });
  }

  // ---------- 탭 ----------
  function goTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("is-active", b.dataset.tab === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (p) {
      p.classList.toggle("is-active", p.id === "tab-" + name);
    });
    window.scrollTo(0, 0);
  }

  function initTabs() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (btn) {
      btn.addEventListener("click", function () { goTab(btn.dataset.tab); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-go]"), function (btn) {
      btn.addEventListener("click", function () { goTab(btn.dataset.go); });
    });
  }

  // ---------- 첫 화면 ----------
  function renderHome() {
    var s = state.data.stats;
    var q = state.data.quick;
    var today = new Date();
    var active = state.data.jobs.jobs.filter(function (j) {
      var k = window.Jobs.statusOf(j, today).key;
      return k === "open" || k === "soon";
    }).length;
    var v3 = q.validation.result["3"];
    var kpis = [
      s ? ["분석한 실제 측정 기록", s.overall.n.toLocaleString() + "건", s.period + " 국민체력100"] : null,
      s ? ["3등급 이상 받은 비율", pct(s.overall.passRate["3"]), "측정자 절반이 3등급 미만"] : null,
      ["딱 한 항목만 모자라 떨어진 성인", pct(q.nearMiss.singleN / q.nearMiss.failN), "3등급 미달 " + q.nearMiss.failN.toLocaleString() + "명 중"],
      ["집에서 두 항목으로 맞힌 비율", pct(v3.accuracy), "3등급 통과 여부, 검증 " + v3.covered.toLocaleString() + "명"],
      ["접수 중·예정 공고", active + "건", "확인한 공고 " + state.data.jobs.jobs.length + "건 중"]
    ].filter(Boolean);
    mount($("home-kpis"), kpis.map(function (k) {
      return h("div", { class: "kpi" }, h("small", null, k[0]), h("b", null, k[1]), h("span", null, k[2]));
    }));
    mount($("home-basis"), "모든 숫자는 국민체육진흥공단 '국민체력100 체력인증센터 측정결과' 공공데이터를 직접 계산한 값입니다. 자세한 근거는 ",
      h("button", { type: "button", class: "link-btn", onclick: function () { goTab("about"); } }, "데이터 출처"), "에 있습니다.");
  }

  // ---------- 1. 공고 선택 ----------
  function renderJobSelect() {
    var groups = { open: "접수 중", soon: "접수 예정", unknown: "일정 확인 필요", closed: "마감 (참고)" };
    var items = window.Jobs.sorted(state.data.jobs.jobs, new Date()).filter(function (x) { return x.job.maxGrade; });
    var opts = [h("option", { value: "" }, "직접 입력 (목록에 없는 공고)")];
    Object.keys(groups).forEach(function (key) {
      var list = items.filter(function (x) { return x.status.key === key; });
      if (!list.length) return;
      opts.push(h("optgroup", { label: groups[key] }, list.map(function (x) {
        return h("option", { value: x.job.id }, x.job.org + " " + x.job.role + " — " + x.job.gradeText);
      })));
    });
    mount($("job-select"), opts);
    $("job-select").addEventListener("change", function () { applyJob($("job-select").value); });
    $("valid-months").addEventListener("change", function () { state.validFrom = null; rerunIfShown(); });
    ["target-grade", "deadline"].forEach(function (id) { $(id).addEventListener("change", rerunIfShown); });
    applyJob("");
  }

  function applyJob(id) {
    var J = window.Jobs;
    var job = state.data.jobs.jobs.filter(function (j) { return j.id === id; })[0] || null;
    state.job = job;
    state.validFrom = null;
    if (!job) {
      mount($("job-hint"), "공고마다 요구 등급과 인증서 유효기간이 다릅니다. 반드시 공고 원문으로 다시 확인하세요.");
      rerunIfShown();
      return;
    }
    $("job-select").value = job.id;
    $("target-grade").value = String(Math.min(job.maxGrade, 4));
    var due = J.dueOf(job);
    if (due) $("deadline").value = due.getFullYear() + "-" + String(due.getMonth() + 1).padStart(2, "0") + "-" + String(due.getDate()).padStart(2, "0");
    var v = job.valid || {};
    if (v.kind === "months" && [3, 6, 12].indexOf(v.months) >= 0) {
      $("valid-months").value = String(v.months);
      state.validFrom = J.validFromOf(job);
    } else {
      $("valid-months").value = "";
      state.validFrom = J.validFromOf(job);
    }
    var status = J.statusOf(job, new Date());
    mount($("job-hint"),
      h("b", null, status.label), " · " + job.gradeText + (job.use ? " (" + job.use + ")" : "") + " · 인증서: " + window.Jobs.validText(job) +
      (job.maxGrade > 4 ? " · 합격선이 아니라 점수·가점으로 반영하는 공고라 등급이 높을수록 유리합니다" : "") + " · ", link(job.source, "공고 원문"));
    rerunIfShown();
  }

  function rerunIfShown() {
    if (!$("step-result").hidden) calculate(false);
  }

  // ---------- 2. 기록 입력 ----------
  function mode() {
    var checked = document.querySelector('[name="mode"]:checked');
    return checked ? checked.value : "quick";
  }

  function applyMode() {
    var m = mode();
    $("record-form").classList.toggle("mode-quick", m === "quick");
    $("record-form").classList.toggle("mode-full", m === "full");
    $("calc-btn").textContent = m === "quick" ? "합격 가능성 보기" : "예상 등급 계산";
    rerunIfShown();
  }

  function renderQuickFields() {
    var box = $("quick-fields");
    mount(box,
      h("p", { class: "group-label" }, "집에서 재는 두 가지 (장비 없이)"),
      h("div", { class: "field-row" }, window.Quick.HOME_ITEMS.map(function (item) {
        return h("label", { class: "field" },
          h("span", null, labelOf(item) + " (" + unitOf(item) + (item === "crossSitup" ? "/1분" : "") + ")"),
          h("input", { name: "q_" + item, type: "number", step: item === "sitReach" ? "0.1" : "1", inputmode: "decimal" }),
          h("small", null, QUICK_HOW[item]));
      })),
      h("p", { class: "hint" }, "왜 두 가지만? 3등급 미달자의 대부분이 이 두 항목에서 걸립니다. 심폐지구력·악력은 장비가 있어야 해서 센터에서만 잴 수 있습니다."));
  }

  function renderFields() {
    var age = num(document.querySelector('[name="age"]').value);
    var senior = age !== null && age >= 65;
    var fields = senior ? window.Fields.SENIOR_FIELDS : window.Fields.ADULT_FIELDS;
    var box = $("record-fields");
    var keep = {};
    Array.prototype.forEach.call(box.querySelectorAll("input"), function (i) { keep[i.name] = i.value; });
    mount(box,
      h("p", { class: "group-label" }, senior ? "어르신(65세 이상) 측정항목" : "성인(19~64세) 측정항목"),
      h("div", { class: "field-row" }, fields.map(function (f) {
        return h("label", { class: "field" },
          h("span", null, f.label + " (" + f.unit + ")"),
          h("input", { name: f.name, type: "number", step: f.step, inputmode: "decimal", value: keep[f.name] || null }),
          f.how ? h("small", null, f.how) : null);
      })));
  }

  function readForm() {
    var form = $("record-form");
    var input = { sex: form.sex.value };
    var m = mode();
    Array.prototype.forEach.call(form.querySelectorAll("input[name]"), function (i) {
      if (i.name.indexOf("q_") === 0) {
        if (m === "quick") input[i.name.slice(2)] = num(i.value);
      } else if (m === "full" || !i.closest(".full-only")) {
        input[i.name] = num(i.value);
      }
    });
    return input;
  }

  function fillSample() {
    var s = window.Fields.SAMPLE;
    var form = $("record-form");
    form.sex.value = s.sex;
    form.age.value = s.age;
    renderFields();
    Object.keys(s).forEach(function (k) {
      if (form[k] && k !== "sex") form[k].value = s[k];
      if (form["q_" + k]) form["q_" + k].value = s[k];
    });
    calculate(true);
  }

  // ---------- 3. 결과 ----------
  function calculate(scroll) {
    var target = Number($("target-grade").value);
    var input = readForm();
    $("step-result").hidden = false;
    if (mode() === "quick") {
      calculateQuick(input, target);
    } else {
      calculateFull(input, target);
    }
    if (scroll !== false) $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function calculateFull(input, target) {
    var result;
    try {
      result = state.engine.evaluate(input);
    } catch (e) {
      mount($("result"), errorBox(e.message));
      $("step-plan").hidden = true;
      return;
    }
    var gaps = target <= 3 ? state.engine.gaps(result, target) : gapsForGrade4(result);
    mount($("result"), resultSummary(result, target, gaps), factorTable(result, target), videoBlock(result.group, gaps));
    renderPlan(result.grade > target);
  }

  // 4등급: 성인은 심폐지구력·근력, 어르신은 8자보행·근기능이 3등급 기준 이상이면 된다
  function gapsForGrade4(result) {
    var defs = state.engine.factorsOf(result.group);
    var need = result.group === "adult" ? ["cardio", "strength"] : ["coordination", "upper"];
    return need.map(function (f) {
      var r = result.factors[f];
      var item = r ? r.item : defs[f].items[0];
      var c = state.engine.cutoff(result.group, 3, result.sex, result.ageKey, item);
      if (r && r.grade !== null) return null;
      return {
        factor: f, label: defs[f].label, item: item, value: r ? r.value : null, cutoff: c,
        gap: r && c !== null ? Math.round(Math.abs(c - r.value) * 10) / 10 : null,
        direction: state.engine.directionOf(item)
      };
    }).filter(Boolean);
  }

  function gapLine(g) {
    var unit = unitOf(g.item);
    var what;
    if (g.direction === "range") what = "권장범위 밖 (BMI 18.5 이상 25 미만 또는 체지방률)";
    else if (g.value === null) what = "기록 없음 · 기준 " + fmtNum(g.cutoff, unit);
    else what = fmtNum(g.gap, unit) + (g.direction === "down" ? " 더 빠르게" : " 더") +
      " (지금 " + fmtNum(g.value, unit) + " → 기준 " + fmtNum(g.cutoff, unit) + ")";
    return h("li", null, h("b", null, g.label + (g.oneOf ? " (둘 중 하나)" : "")), " " + what);
  }

  function resultSummary(result, target, gaps) {
    var pass = result.grade <= target;
    var notes = [];
    if ((result.missing || []).length) notes.push("입력하지 않은 항목이 " + result.missing.length + "개 있어 실제보다 낮게 나올 수 있습니다.");
    if (!pass && gaps.length === 1 && gaps[0].value !== null) notes.push(gaps[0].label + " 한 항목만 올리면 목표 등급입니다.");
    return h("div", null,
      h("div", { class: "result-head " + (pass ? "pass" : "fail") },
        h("div", { class: "big-grade" }, "예상 ", h("b", null, result.grade + "등급")),
        h("div", { class: "verdict" }, pass
          ? "요구 등급(" + target + "등급 이내)을 넘습니다."
          : "요구 등급(" + target + "등급 이내)까지 " + gaps.length + "개 항목이 모자랍니다.")),
      notes.length ? h("p", { class: "note" }, notes.map(function (n, i) { return [i ? h("br") : null, n]; })) : null,
      gaps.length ? h("ul", { class: "gap-list" }, gaps.map(gapLine)) : null);
  }

  function factorTable(result, target) {
    var defs = state.engine.factorsOf(result.group);
    var cutGrade = Math.min(target, 3);
    var rows = Object.keys(defs).map(function (f) {
      var r = result.factors[f];
      var item = r ? r.item : defs[f].items[0];
      var c = state.engine.cutoff(result.group, cutGrade, result.sex, result.ageKey, item);
      var tag = !r ? h("span", { class: "tag gray" }, "미입력")
        : r.grade === null ? h("span", { class: "tag red" }, "3등급 미만")
        : h("span", { class: "tag " + (r.grade <= cutGrade ? "green" : "amber") }, r.grade + "등급 수준");
      var rank = r ? state.quick.percentile(result.group, result.sex, result.ageKey, item === "relGrip" && result.group === "senior" ? "absGrip" : item,
        item === "relGrip" && result.group === "senior" ? result.input.absGrip : r.value) : null;
      return h("tr", null,
        h("td", null, defs[f].label, h("small", null, labelOf(item))),
        h("td", null, r ? fmtNum(r.value, unitOf(item)) : "-"),
        h("td", null, c === null && defs[f].group === "motor" ? h("small", null, "3등급은 판정에 안 씀") : fmtNum(c, unitOf(item))),
        h("td", null, rankText(rank)),
        h("td", null, tag));
    });
    return h("div", null,
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null,
          h("th", null, "체력요인"), h("th", null, "내 기록"),
          h("th", null, cutGrade + "등급 기준 (" + result.ageKey + "세 " + (result.sex === "M" ? "남" : "여") + ")"),
          h("th", null, "동년배 중 위치"),
          h("th", null, "항목 수준"))),
        h("tbody", null, rows))),
      h("p", { class: "hint" }, "기준값: 국민체력100 공식 인증기준표 · 판정 규칙: 문화체육관광부 고시 제2025-0027호 · 동년배 위치: 같은 성별·연령대 측정자 기록 기준(5% 단위)"));
  }

  // ---------- 3-1. 간이 진단 결과 ----------
  function levelText(level, need) {
    if (level === 0) return "3등급 기준 미달";
    return level <= need ? need + "등급 기준 이상" : need + "등급 기준 미달 (" + level + "등급 수준)";
  }

  function calculateQuick(input, target) {
    var d = state.quick.diagnose(input, target);
    if (!d.ok) {
      mount($("result"), errorBox(d.message), d.senior ? h("button", { type: "button", class: "link-btn", onclick: function () {
        document.querySelector('[name="mode"][value="full"]').checked = true;
        applyMode();
      } }, "전체 기록 입력으로 바꾸기") : null);
      $("step-plan").hidden = true;
      return;
    }
    var need = Math.min(target, 3);
    var gradeName = target + "등급" + (target === 1 ? "" : " 이상");
    var now = d.now;
    var rate = now ? now.rate : null;
    var tone = rate === null ? "fail" : rate >= 0.7 ? "pass" : rate >= 0.3 ? "fail" : "low";
    var shortItems = d.items.filter(function (i) { return i.short; });

    var who = d.ageKey + "세 " + sexName(input.sex) + " · " + d.items.map(function (i) {
      return labelOf(i.item) + " " + levelText(i.level, need);
    }).join(" · ") + " · BMI " + (d.bmiOk ? "권장범위 안" : "권장범위 밖");

    var head = h("div", { class: "result-head " + tone },
      h("div", { class: "big-grade" }, gradeName + " 받을 가능성 ", h("b", null, rate === null ? "-" : "약 " + pct(rate, 0))),
      h("div", { class: "verdict" }, now
        ? "나와 같은 조건이었던 실제 측정자 " + now.n.toLocaleString() + "명 중 " + now.passed.toLocaleString() + "명이 " + gradeName + "을 받았습니다."
        : "같은 조건의 측정 기록이 적어 계산하지 않았습니다."));

    var rows = d.items.map(function (i) {
      var unit = unitOf(i.item);
      return h("tr", null,
        h("td", null, labelOf(i.item)),
        h("td", null, fmtNum(i.value, unit)),
        h("td", null, target === 4 ? h("small", null, "4등급 판정에 안 씀") : fmtNum(i.cutoff, unit)),
        h("td", null, rankText(i.percentile)),
        h("td", null, i.short
          ? h("span", { class: "tag red" }, fmtNum(i.gap, unit) + " 모자람")
          : h("span", { class: "tag green" }, target === 4 ? "참고" : "기준 이상")));
    });

    var fix = null;
    if (shortItems.length && d.ifFixed) {
      fix = h("div", { class: "whatif" },
        h("b", null, shortItems.map(function (i) {
          return labelOf(i.item) + " " + fmtNum(i.cutoff, unitOf(i.item)) + "(" + fmtNum(i.gap, unitOf(i.item)) + " 더)";
        }).join(", ") + "까지 올리면"),
        h("span", null, " 가능성이 ", h("b", null, pct(rate, 0) + " → " + pct(d.ifFixed.rate, 0)),
          " (같은 조건이었던 " + d.ifFixed.n.toLocaleString() + "명 기준)"));
    }

    var notes = [];
    if (target <= 3 && now && rate < 1 && !shortItems.length) notes.push("나머지 가능성은 센터에서만 재는 심폐지구력(왕복오래달리기 등)과 근력(악력)에 달려 있습니다.");
    if (target === 3 && !d.bmiOk) notes.push("BMI " + d.bmi + "는 권장범위(18.5 이상 25 미만) 밖입니다. 센터에서 잰 체지방률이 기준 안이면 인정되므로 그 결과에 따라 달라집니다.");
    if (target === 4) notes.push("4등급은 심폐지구력과 근력(악력)으로만 정해집니다. 집에서 잰 두 항목은 체력 수준을 짐작하는 참고값입니다.");
    if (now && now.pooled) notes.push("이 연령대에서 같은 조건인 사람이 적어 전 연령 " + sexName(input.sex) + " 기록으로 계산했습니다.");
    notes.push(HOME_MARGIN);

    var v = state.quick.validation.result[String(target)];
    var gaps = shortItems.map(function (i) { return { factor: QUICK_FACTOR[i.item], label: labelOf(i.item) }; });
    mount($("result"),
      head,
      h("p", { class: "hint" }, "비교한 조건: " + who),
      fix,
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null, h("th", null, "항목"), h("th", null, "내 기록"),
          h("th", null, need + "등급 기준 (" + d.ageKey + "세 " + (input.sex === "M" ? "남" : "여") + ")"),
          h("th", null, "동년배 중 위치"), h("th", null, "판정"))),
        h("tbody", null, rows))),
      h("ul", { class: "gap-list" }, notes.map(function (n) { return h("li", null, n); })),
      v ? h("p", { class: "hint" }, "정확도: 2026년 5월까지 기록으로 만든 표로 6~9월 측정자 " + v.covered.toLocaleString() + "명의 " + gradeName +
        " 여부를 " + pct(v.accuracy) + " 맞혔습니다. (센터에서 잰 기록 기준)") : null,
      videoBlock("adult", gaps));
    renderPlan(rate === null || rate < 0.7);
  }

  function videoBlock(group, gaps) {
    var targets = group === "senior" ? ["어르신", "공통"] : ["공통"];
    var used = {};
    var groups = gaps.filter(function (g) { return g.factor !== "body"; }).map(function (g) {
      var names = window.Fields.VIDEO_FACTORS[g.factor] || [];
      var prefer = window.Fields.VIDEO_PREFER[g.factor] || [];
      var homeTools = window.Fields.HOME_TOOLS;
      // 점수가 낮을수록 먼저: 맞는 부위(0/1) + 집에서 할 수 있는지(0/2)
      var score = function (v) {
        var part = prefer.some(function (p) { return (v.part || "").indexOf(p) >= 0; }) ? 0 : 1;
        var home = v.place !== "헬스장" && homeTools.indexOf(v.tool || "") >= 0 ? 0 : 2;
        return part + home;
      };
      var picks = state.data.videos.filter(function (v) {
        return targets.indexOf(v.target) >= 0 && names.indexOf(v.factor) >= 0 && !used[v.url];
      }).sort(function (a, b) { return score(a) - score(b); }).slice(0, VIDEOS_PER_ITEM);
      picks.forEach(function (v) { used[v.url] = true; });
      if (!picks.length) return null;
      return h("div", { class: "video-group" },
        h("h3", null, g.label + " 올리기"),
        h("div", { class: "video-row" }, picks.map(function (v) {
          return h("a", { class: "video-card", href: v.url, target: "_blank", rel: "noopener" },
            v.thumb ? h("img", { loading: "lazy", src: v.thumb, alt: "" }) : null,
            h("span", null, v.exercise || v.title),
            h("small", null, [v.level, v.place, v.tool].filter(Boolean).join(" · ")));
        })));
    }).filter(Boolean);
    if (!groups.length) return null;
    return h("div", { class: "videos" }, h("h3", { class: "sub" }, "모자란 항목별 공단 운동처방 영상"), groups);
  }

  // ---------- 4. 일정 ----------
  function renderPlan(needsTraining) {
    var box = $("plan");
    $("step-plan").hidden = false;
    var deadlineValue = $("deadline").value;
    if (!deadlineValue) {
      mount(box, h("p", { class: "hint" }, "1번에서 인증서 제출 마감일을 넣으면 측정 예약 일정을 계산합니다."));
      return;
    }
    var parts = deadlineValue.split("-").map(Number);
    var validMonths = num($("valid-months").value);
    var p = window.Schedule.plan({
      deadline: new Date(parts[0], parts[1] - 1, parts[2]), validMonths: validMonths, validFrom: state.validFrom, today: new Date()
    });
    if (!p.ok) {
      mount(box, errorBox(p.message));
      return;
    }
    var fmt = window.Schedule.fmt;
    var weeks = Math.floor(p.trainingDays / 7);
    var now = new Date();
    var rounds = p.rounds.map(function (r, i) {
      var role = [];
      if (r.open <= now) role.push("이미 열림 · 남은 자리 확인");
      else if (i === 0 || p.rounds[i - 1].open <= now) role.push("다음 예약 오픈");
      if (i === p.rounds.length - 1) role.push("마지막 기회");
      return h("tr", null, h("td", null, fmt(r.open) + " 13시"), h("td", null, fmt(r.start) + " ~ " + fmt(r.end)), h("td", null, role.join(" · ")));
    });
    var validNote = p.validFrom
      ? " (" + fmt(p.validFrom) + " 이후 측정분만 인정)"
      : " (유효기간을 모르면 공고 원문을 확인하세요)";
    mount(box,
      h("ul", { class: "plan-list" },
        h("li", null, "측정 가능 기간: ", h("b", null, fmt(p.windowStart) + " ~ " + fmt(p.windowEnd)), validNote),
        h("li", null, "인증서 발급·서류 준비 여유 " + p.safetyDays + "일을 뺐습니다."),
        h("li", null, "준비 기간: 약 ", h("b", null, weeks + "주"),
          needsTraining ? " — 모자란 항목을 먼저 연습한 뒤, 떨어져도 한 번 더 잴 수 있게 앞쪽 회차에 측정하세요." : " — 지금 기록이면 첫 회차에 측정해도 됩니다.")),
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null, h("th", null, "예약 열리는 때"), h("th", null, "측정할 수 있는 날"), h("th", null, ""))),
        h("tbody", null, rounds))),
      h("p", { class: "hint" }, "예약은 매월 1일 13시(2~16일 측정분), 16일 13시(17일~다음 달 1일 측정분)에 열립니다. 인기 센터는 1~2분 만에 마감되니 10분 전에 로그인하세요. ",
        link(RESERVE_URL, "국민체력100 예약하기")));
  }

  // ---------- 5. 센터 ----------
  function renderCenters() {
    var regions = [];
    state.data.centers.forEach(function (c) { if (c.region && regions.indexOf(c.region) < 0) regions.push(c.region); });
    regions.sort();
    mount($("center-region"), regions.map(function (r) { return h("option", { selected: r === DEFAULT_REGION }, r); }));
    $("center-region").addEventListener("change", drawCenters);
    drawCenters();
  }

  function drawCenters() {
    var region = $("center-region").value;
    var list = state.data.centers.filter(function (c) { return c.region === region; });
    if (!list.length) {
      mount($("center-list"), h("p", { class: "hint" }, "이 지역 센터 정보가 없습니다."));
      return;
    }
    mount($("center-list"), list.map(function (c) {
      var months = Object.keys(c.seasonality || {});
      var quiet = months.slice().sort(function (a, b) { return c.seasonality[a] - c.seasonality[b]; }).slice(0, 2);
      var busy = months.slice().sort(function (a, b) { return c.seasonality[b] - c.seasonality[a]; })[0];
      var info = "최근 월평균 " + c.recentAvg + "명 측정" +
        (quiet.length ? " · 한산한 달 " + quiet.map(function (m) { return MONTH_NAMES[m - 1]; }).join(", ") : "") +
        (busy ? " · 붐비는 달 " + MONTH_NAMES[busy - 1] : "");
      return h("div", { class: "center-card" },
        h("b", null, c.name), h("span", null, c.address || "주소는 국민체력100 누리집에서 확인"), h("small", null, info));
    }));
  }

  // ---------- 시작 ----------
  function start() {
    initTabs();
    var keys = Object.keys(DATA_FILES);
    Promise.all(keys.map(loadJson)).then(function (values) {
      keys.forEach(function (k, i) { state.data[k] = values[i]; });
      state.engine = window.GradeEngine.makeEngine(state.data.criteria);
      state.quick = window.Quick.makeQuick(state.data.quick, state.engine, state.data.criteria);
      renderHome();
      renderJobSelect();
      renderQuickFields();
      renderFields();
      applyMode();
      renderCenters();
      window.Jobs.renderTab(state.data, function (id) {
        goTab("applicant");
        applyJob(id);
      });
      window.Employer.render(state.data);
      document.querySelector('[name="age"]').addEventListener("change", renderFields);
      Array.prototype.forEach.call(document.querySelectorAll('[name="mode"]'), function (r) { r.addEventListener("change", applyMode); });
      $("fill-sample").addEventListener("click", fillSample);
      $("record-form").addEventListener("submit", function (e) { e.preventDefault(); calculate(true); });
    }).catch(function (e) {
      mount(document.querySelector("main"), errorBox("데이터를 불러오지 못했습니다: " + e.message));
    });
  }

  start();
})();
