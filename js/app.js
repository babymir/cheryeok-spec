/*
 * 체력스펙 — 지원자 화면 (공고 선택 → 기록 입력 → 결과 → 일정 → 센터)
 * 계산은 grade.js(등급), schedule.js(일정)에 맡기고 여기서는 화면만 그린다.
 * 채용 담당자·데이터 출처 화면은 employer.js 에 있다.
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
    stats: "data/stats.json",
    validation: "data/validation.json"
  };
  var OPTIONAL = { stats: true, validation: true };
  var VIDEOS_PER_ITEM = 3;
  var MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  var DEFAULT_REGION = "서울";
  var RESERVE_URL = "https://nfa.kspo.or.kr/reserve/selectReserveStep1.kspo";

  var state = { data: {}, engine: null, job: null };

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

  function unitOf(item) {
    var it = state.data.criteria.items[item];
    return it ? it.unit : "";
  }

  function labelOf(item) {
    var it = state.data.criteria.items[item];
    return it ? it.label : "";
  }

  function errorBox(message) {
    return h("p", { class: "error" }, message);
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
  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    Array.prototype.forEach.call(tabs, function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs, function (b) { b.classList.remove("is-active"); });
        Array.prototype.forEach.call(document.querySelectorAll(".tab-panel"), function (p) { p.classList.remove("is-active"); });
        btn.classList.add("is-active");
        $("tab-" + btn.dataset.tab).classList.add("is-active");
        window.scrollTo(0, 0);
      });
    });
  }

  // ---------- 1. 공고 선택 ----------
  function jobCard(value, checked, parts) {
    return h("label", { class: "job-card" + (value === "custom" ? " custom" : "") },
      h("input", { type: "radio", name: "job", value: value, checked: checked }),
      parts.map(function (p) { return h("span", { class: p[0] }, p[1]); }));
  }

  function renderJobs() {
    var jobs = state.data.jobs.jobs;
    var cards = jobs.map(function (j) {
      return jobCard(j.id, false, [
        ["job-org", j.org], ["job-role", j.role], ["job-grade", j.gradeText],
        ["job-valid", j.validMonths ? "유효 " + j.validMonths + "개월" : "유효기간 공고 확인"]
      ]);
    });
    cards.push(jobCard("custom", true, [["job-org", "직접 입력"], ["job-role", "목록에 없는 공고"], ["job-grade", "아래에서 등급·유효기간 선택"]]));
    mount($("job-list"), cards);

    $("job-list").addEventListener("change", function (e) {
      if (e.target.name !== "job") return;
      var job = jobs.filter(function (j) { return j.id === e.target.value; })[0] || null;
      state.job = job;
      if (job) {
        $("target-grade").value = String(Math.min(job.maxGrade, 4));
        $("valid-months").value = job.validMonths ? String(job.validMonths) : "";
        mount($("job-hint"), job.org + " " + job.role + " · " + job.validBasis + " · " + job.use + " · ", link(job.source, "공고 출처"));
      } else {
        mount($("job-hint"), "요구 등급과 유효기간을 직접 고르세요.");
      }
      rerunIfShown();
    });
    ["target-grade", "valid-months", "deadline"].forEach(function (id) {
      $(id).addEventListener("change", rerunIfShown);
    });
    mount($("job-hint"), "공고마다 요구 등급과 인증서 유효기간이 다릅니다. 반드시 공고 원문으로 다시 확인하세요.");
  }

  function rerunIfShown() {
    if (!$("step-result").hidden) calculate(false);
  }

  // ---------- 2. 기록 입력 ----------
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
    Array.prototype.forEach.call(form.querySelectorAll("input"), function (i) {
      input[i.name] = num(i.value);
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
    });
    calculate(true);
  }

  // ---------- 3. 결과 ----------
  function calculate(scroll) {
    var target = Number($("target-grade").value);
    var input = readForm();
    $("step-result").hidden = false;
    var result;
    try {
      result = state.engine.evaluate(input);
    } catch (e) {
      mount($("result"), errorBox(e.message));
      $("step-plan").hidden = true;
      return;
    }
    var gaps = target <= 3 ? state.engine.gaps(result, target) : gapsForGrade4(result);
    mount($("result"), resultSummary(result, target, gaps), factorTable(result, target), videoBlock(result, gaps));
    renderPlan(result, target);
    if (scroll !== false) $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
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
      return h("tr", null,
        h("td", null, defs[f].label, h("small", null, labelOf(item))),
        h("td", null, r ? fmtNum(r.value, unitOf(item)) : "-"),
        h("td", null, c === null && defs[f].group === "motor" ? h("small", null, "3등급은 판정에 안 씀") : fmtNum(c, unitOf(item))),
        h("td", null, tag));
    });
    return h("div", null,
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null,
          h("th", null, "체력요인"), h("th", null, "내 기록"),
          h("th", null, cutGrade + "등급 기준 (" + result.ageKey + "세 " + (result.sex === "M" ? "남" : "여") + ")"),
          h("th", null, "항목 수준"))),
        h("tbody", null, rows))),
      h("p", { class: "hint" }, "기준값: 국민체력100 공식 인증기준표 · 판정 규칙: 문화체육관광부 고시 제2025-0027호"));
  }

  function videoBlock(result, gaps) {
    var targets = result.group === "senior" ? ["어르신", "공통"] : ["공통"];
    var used = {};
    var groups = gaps.filter(function (g) { return g.factor !== "body"; }).map(function (g) {
      var names = window.Fields.VIDEO_FACTORS[g.factor] || [];
      var prefer = window.Fields.VIDEO_PREFER[g.factor] || [];
      var score = function (v) {
        return prefer.some(function (p) { return (v.part || "").indexOf(p) >= 0; }) ? 0 : 1;
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
  function renderPlan(result, target) {
    var box = $("plan");
    $("step-plan").hidden = false;
    var deadlineValue = $("deadline").value;
    if (!deadlineValue) {
      mount(box, h("p", { class: "hint" }, "1번에서 서류 마감일을 넣으면 측정 예약 일정을 계산합니다."));
      return;
    }
    var parts = deadlineValue.split("-").map(Number);
    var validMonths = num($("valid-months").value);
    var p = window.Schedule.plan({ deadline: new Date(parts[0], parts[1] - 1, parts[2]), validMonths: validMonths, today: new Date() });
    if (!p.ok) {
      mount(box, errorBox(p.message));
      return;
    }
    var fmt = window.Schedule.fmt;
    var weeks = Math.floor(p.trainingDays / 7);
    var rounds = p.rounds.map(function (r, i) {
      var role = i === 0 ? "가장 빠른 회차" : i === p.rounds.length - 1 ? "마지막 기회" : "";
      return h("tr", null, h("td", null, fmt(r.open) + " 13시"), h("td", null, fmt(r.start) + " ~ " + fmt(r.end)), h("td", null, role));
    });
    mount(box,
      h("ul", { class: "plan-list" },
        h("li", null, "측정 가능 기간: ", h("b", null, fmt(p.windowStart) + " ~ " + fmt(p.windowEnd)),
          p.validFrom ? " (유효기간 " + validMonths + "개월 → " + fmt(p.validFrom) + " 이후 측정분만 인정)" : " (유효기간을 모르면 공고 원문을 확인하세요)"),
        h("li", null, "인증서 발급·서류 준비 여유 " + p.safetyDays + "일을 뺐습니다."),
        h("li", null, "준비 기간: 약 ", h("b", null, weeks + "주"),
          result.grade > target ? " — 모자란 항목을 먼저 연습한 뒤 측정하세요." : " — 지금 기록이면 첫 회차에 측정해도 됩니다.")),
      h("div", { class: "table-scroll" }, h("table", { class: "grid" },
        h("thead", null, h("tr", null, h("th", null, "예약 열리는 때"), h("th", null, "측정할 수 있는 날"), h("th", null, ""))),
        h("tbody", null, rounds))),
      h("p", { class: "hint" }, "예약은 매월 1일 13시(2~16일 측정분), 16일 13시(17일~다음 달 1일 측정분)에 열립니다. 인기 센터는 금방 마감되니 10분 전에 로그인하세요. ",
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
      renderJobs();
      renderFields();
      renderCenters();
      window.Employer.render(state.data);
      document.querySelector('[name="age"]').addEventListener("change", renderFields);
      $("fill-sample").addEventListener("click", fillSample);
      $("record-form").addEventListener("submit", function (e) { e.preventDefault(); calculate(true); });
    }).catch(function (e) {
      mount(document.querySelector("main"), errorBox("데이터를 불러오지 못했습니다: " + e.message));
    });
  }

  start();
})();
