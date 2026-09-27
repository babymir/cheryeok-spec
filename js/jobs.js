/*
 * 채용공고 — 접수 상태 계산, "내 인증서로 지원 가능한가" 판정, 공고 탭 화면
 * 입력 데이터: data/jobs.json (공고 원문·보도로 직접 확인한 것만)
 *
 * 공고 한 건의 형식 (확인 못 한 칸은 null)
 *   maxGrade: 요구 최저 등급(숫자), applyStart/applyEnd/certDue: "YYYY-MM-DD"
 *   valid: { kind: "months", months, base, baseLabel } | { kind: "since", date, label } | { kind: "unknown" }
 */
(function (root) {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;

  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split("-").map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function atMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addMonths(d, n) {
    var r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (r.getDate() !== d.getDate()) r = new Date(r.getFullYear(), r.getMonth(), 0);
    return r;
  }

  function fmt(d) {
    return d ? d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() : "-";
  }

  /** 접수 상태: open(접수 중) · soon(예정) · closed(마감) · unknown(일정 미확인) */
  function statusOf(job, today) {
    var t = atMidnight(today);
    var start = parseDate(job.applyStart);
    var end = parseDate(job.applyEnd);
    if (!start && !end) return { key: "unknown", label: "일정 확인 필요" };
    if (end && t > end) return { key: "closed", label: "마감" };
    if (start && t < start) {
      var days = Math.round((start - t) / DAY);
      return { key: "soon", label: "접수 " + days + "일 전", days: days };
    }
    var left = end ? Math.round((end - t) / DAY) : null;
    return { key: "open", label: left === null ? "접수 중" : left === 0 ? "오늘 마감" : "마감 " + left + "일 전", days: left };
  }

  /** 인증서가 인정되기 시작하는 날 (이날 이후 측정분만 인정). 모르면 null */
  function validFromOf(job) {
    var v = job.valid || { kind: "unknown" };
    if (v.kind === "since") return parseDate(v.date);
    if (v.kind === "months" && v.months) {
      var base = parseDate(v.base);
      return base ? addMonths(base, -v.months) : null;
    }
    return null;
  }

  /** 서류에 인증서를 내야 하는 마지막 날 */
  function dueOf(job) {
    return parseDate(job.certDue) || parseDate(job.applyEnd);
  }

  /**
   * 내 인증서(등급, 측정일)로 이 공고에 낼 수 있는가
   * 반환 { key: ok|grade|expired|late|check, label, detail }
   */
  function checkCert(job, grade, measuredOn) {
    if (!grade) return null;
    if (job.maxGrade && grade > job.maxGrade) {
      return { key: "grade", label: "등급 부족", detail: job.gradeText };
    }
    var from = validFromOf(job);
    var due = dueOf(job);
    if (measuredOn && from && measuredOn < from) {
      return { key: "expired", label: "유효기간 지남", detail: fmt(from) + " 이후 측정분만 인정" };
    }
    if (measuredOn && due && measuredOn > due) {
      return { key: "late", label: "제출일 뒤 측정", detail: "인증서 제출 " + fmt(due) + "까지" };
    }
    if (!job.maxGrade) return { key: "check", label: "확인 필요", detail: "요구 등급을 공고 원문에서 확인하세요" };
    if (!measuredOn) return { key: "check", label: "등급 충족", detail: "측정일을 넣으면 유효기간도 확인합니다" };
    if (!from) return { key: "check", label: "등급 충족", detail: "유효기간 기준일은 공고 원문에서 확인하세요" };
    return { key: "ok", label: "제출 가능", detail: fmt(from) + " 이후 측정분 인정" };
  }

  var api = { statusOf: statusOf, validFromOf: validFromOf, dueOf: dueOf, checkCert: checkCert, parseDate: parseDate, fmt: fmt };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  // ---------- 화면 (브라우저 전용) ----------
  var h = root.Dom.h;
  var mount = root.Dom.mount;
  var link = root.Dom.link;
  var STATUS_ORDER = { open: 0, soon: 1, unknown: 2, closed: 3 };
  var STATUS_TAG = { open: "green", soon: "blue", unknown: "gray", closed: "gray" };
  var CHECK_TAG = { ok: "green", grade: "red", expired: "red", late: "amber", check: "gray" };

  function $(id) { return document.getElementById(id); }

  /** 공고 목록을 상태 순(접수 중 → 예정 → 미확인 → 마감)으로 */
  function sorted(jobs, today) {
    return jobs.map(function (j) { return { job: j, status: statusOf(j, today) }; }).sort(function (a, b) {
      var d = STATUS_ORDER[a.status.key] - STATUS_ORDER[b.status.key];
      if (d) return d;
      var ea = parseDate(a.job.applyEnd), eb = parseDate(b.job.applyEnd);
      if (a.status.key === "closed") return (eb || 0) - (ea || 0);
      return (ea || Infinity) - (eb || Infinity);
    });
  }

  function validText(job) {
    if (job.validText) return job.validText;
    var from = validFromOf(job);
    return from ? fmt(from) + " 이후 측정분" : "유효기간 공고 확인";
  }

  function jobCard(item, check, onPrepare) {
    var j = item.job;
    var s = item.status;
    var period = j.applyStart || j.applyEnd ? fmt(parseDate(j.applyStart)) + " ~ " + fmt(parseDate(j.applyEnd)) : "접수 일정 공고 확인";
    return h("article", { class: "posting" + (s.key === "closed" ? " is-closed" : "") },
      h("div", { class: "posting-top" },
        h("span", { class: "tag " + STATUS_TAG[s.key] }, s.label),
        check ? h("span", { class: "tag " + CHECK_TAG[check.key], title: check.detail }, check.label) : null,
        h("span", { class: "posting-cat" }, [j.category, j.region].filter(Boolean).join(" · "))),
      h("b", { class: "posting-role" }, j.org + " " + j.role),
      h("dl", { class: "posting-facts" },
        h("dt", null, "요구 등급"), h("dd", null, j.gradeText || "공고 확인", j.use ? h("small", null, " · " + j.use) : null),
        h("dt", null, "인증서"), h("dd", null, validText(j)),
        h("dt", null, "접수"), h("dd", null, period, j.certDue ? h("small", null, " · 인증서 제출 " + fmt(parseDate(j.certDue)) + "까지") : null)),
      // '등급 부족'의 설명은 요구 등급 줄과 같아서 되풀이하지 않는다
      check && check.key !== "ok" && check.key !== "grade" ? h("p", { class: "posting-note" }, check.detail) : null,
      j.note ? h("p", { class: "posting-note" }, j.note) : null,
      h("div", { class: "posting-actions" },
        s.key !== "closed" && j.maxGrade ? h("button", { type: "button", class: "small-btn", onclick: function () { onPrepare(j.id); } }, "이 공고로 준비하기") : null,
        link(j.source, j.sourceType === "보도" || j.sourceType === "2차 출처" ? "출처(" + j.sourceType + ")" : "공고 원문")));
  }

  function renderTab(data, onPrepare) {
    var jobs = data.jobs.jobs;
    var cats = [];
    jobs.forEach(function (j) { if (j.category && cats.indexOf(j.category) < 0) cats.push(j.category); });
    mount($("jobs-cat"), h("option", { value: "" }, "전체 직종"), cats.map(function (c) { return h("option", { value: c }, c); }));

    function draw() {
      var today = new Date();
      var onlyActive = $("jobs-active").checked;
      var cat = $("jobs-cat").value;
      var grade = Number($("cert-grade").value) || null;
      var measuredOn = parseDate($("cert-date").value);
      var list = sorted(jobs, today).filter(function (x) {
        if (onlyActive && x.status.key === "closed") return false;
        return !cat || x.job.category === cat;
      });
      var counts = { open: 0, soon: 0 };
      sorted(jobs, today).forEach(function (x) { if (counts[x.status.key] !== undefined) counts[x.status.key]++; });
      mount($("jobs-summary"), "확인한 공고 " + jobs.length + "건 · 접수 중 " + counts.open + "건 · 예정 " + counts.soon + "건 (" + data.jobs.updated + " 확인)");
      mount($("jobs-list"), list.length ? list.map(function (x) {
        return jobCard(x, checkCert(x.job, grade, measuredOn), onPrepare);
      }) : h("p", { class: "hint" }, "조건에 맞는 공고가 없습니다."));
    }
    ["jobs-active", "jobs-cat", "cert-grade", "cert-date"].forEach(function (id) { $(id).addEventListener("change", draw); });
    draw();
  }

  root.Jobs = Object.assign({ renderTab: renderTab, sorted: sorted, validText: validText }, api);
})(this);
