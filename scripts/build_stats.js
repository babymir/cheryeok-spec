/*
 * 채용 담당자 화면용 통계(data/stats.json)를 만든다.
 * - 통과율: 측정결과 API의 실제 인증등급(상장구분) 기준. '참가'(측정 미완료 등)는 뺀다.
 * - 떨어진 이유: 등급 엔진(js/grade.js, 실제 등급과 일치 검증됨)으로 목표 등급까지 모자란 체력요인을 센다.
 * 실행: node scripts/build_stats.js   (먼저 collect_measurements.py 로 raw/measure 를 채워야 한다)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeEngine } = require("../js/grade.js");

const SERVICE_DIR = path.resolve(__dirname, "..");
const RAW_DIR = path.join(SERVICE_DIR, "raw", "measure");
const OUT = path.join(SERVICE_DIR, "data", "stats.json");
const TARGETS = [1, 2, 3, 4];
const MIN_BAND_N = 200; // 이보다 적은 집단은 화면에서 흐리게
const criteria = JSON.parse(fs.readFileSync(path.join(SERVICE_DIR, "data", "criteria.json"), "utf8"));
const engine = makeEngine(criteria);

function num(v, keepZero) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 0 && !keepZero ? null : n;
}

// validate_engine.js 와 같은 필드 대응
function toInput(r) {
  return {
    sex: r.test_sex, age: num(r.age_degree),
    height: num(r.item_f001), weight: num(r.item_f002), bodyFat: num(r.item_f003), bmi: num(r.item_f018),
    gripLeft: num(r.item_f007), gripRight: num(r.item_f008), relGrip: num(r.item_f028), absGrip: num(r.item_f052),
    shuttle20: num(r.item_f020), vo2max: num(r.item_f035) || num(r.item_f037),
    crossSitup: num(r.item_f019, true), sitReach: num(r.item_f012, true),
    run10x4: num(r.item_f021), reaction: num(r.item_f040), longJump: num(r.item_f022), airTime: num(r.item_f041),
    step2min: num(r.item_f025), walk6min: num(r.item_f024), chairStand: num(r.item_f023, true),
    tug3m: num(r.item_f026), fig8: num(r.item_f027),
  };
}

// 목표 4등급: 성인은 심폐·근력, 어르신은 8자보행·근기능(상지 또는 하지)
function reasonsFor(result, target) {
  if (target <= 3) {
    return engine.gaps(result, target).map((g) => (g.oneOf ? "민첩성·순발력(둘 중 하나)" : g.label));
  }
  const f = result.factors;
  if (result.group === "adult") {
    return [["cardio", "심폐지구력"], ["strength", "근력"]]
      .filter(([k]) => !f[k] || f[k].grade === null).map(([, label]) => label);
  }
  const list = [];
  if (!f.coordination || f.coordination.grade === null) list.push("협응력(8자보행)");
  const upperOk = f.upper && f.upper.grade !== null;
  const lowerOk = f.lower && f.lower.grade !== null;
  if (!upperOk && !lowerOk) list.push("근기능(악력 또는 의자 일어서기)");
  return list;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`[오류] 측정 원본 폴더가 없습니다: ${RAW_DIR}`);
    process.exit(1);
  }
  const bands = new Map();
  const reasons = {};
  const overall = { n: 0, pass: Object.fromEntries(TARGETS.map((t) => [t, 0])) };
  let minYm = "999999";
  let maxYm = "000000";
  let skipped = 0;

  for (const file of fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf8"))) {
      const m = String(r.cert_gbn || "").match(/^(\d)등급$/);
      const input = toInput(r);
      if (!m || !input.age || input.age < 19 || !["M", "F"].includes(input.sex)) { skipped++; continue; }
      const official = Number(m[1]);
      let result;
      try { result = engine.evaluate(input); } catch (e) { skipped++; continue; }

      const key = `${result.group}|${input.sex}|${result.ageKey}`;
      if (!bands.has(key)) {
        bands.set(key, { group: result.group, sex: input.sex, ageKey: result.ageKey, n: 0, pass: Object.fromEntries(TARGETS.map((t) => [t, 0])) });
      }
      const band = bands.get(key);
      band.n++;
      overall.n++;
      if (r.test_ym < minYm) minYm = r.test_ym;
      if (r.test_ym > maxYm) maxYm = r.test_ym;

      for (const t of TARGETS) {
        if (official <= t) {
          band.pass[t]++;
          overall.pass[t]++;
          continue;
        }
        const bucket = ((reasons[t] = reasons[t] || {})[result.group] = reasons[t][result.group] || { n: 0, single: 0, counts: {} });
        const list = reasonsFor(result, t);
        bucket.n++;
        if (list.length === 1) bucket.single++;
        for (const label of list) bucket.counts[label] = (bucket.counts[label] || 0) + 1;
      }
    }
  }

  const rate = (p, n) => Object.fromEntries(TARGETS.map((t) => [t, n ? Math.round((p[t] / n) * 10000) / 10000 : null]));
  const ageOrder = (a) => parseInt(a, 10);
  const stats = {
    period: `${minYm.slice(0, 4)}.${Number(minYm.slice(4))} ~ ${maxYm.slice(0, 4)}.${Number(maxYm.slice(4))}`,
    builtAt: new Date().toISOString().slice(0, 10),
    minBandN: MIN_BAND_N,
    overall: { n: overall.n, passRate: rate(overall.pass, overall.n) },
    bands: [...bands.values()]
      .sort((a, b) => (a.group === b.group ? ageOrder(a.ageKey) - ageOrder(b.ageKey) || a.sex.localeCompare(b.sex) : a.group === "adult" ? -1 : 1))
      .map((b) => ({ group: b.group, sex: b.sex, ageKey: b.ageKey, n: b.n, passRate: rate(b.pass, b.n) })),
    failReasons: Object.fromEntries(Object.entries(reasons).map(([t, byGroup]) => [t, Object.fromEntries(
      Object.entries(byGroup).map(([g, b]) => [g, {
        n: b.n, single: b.single,
        top: Object.entries(b.counts).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([label, count]) => ({ label, count })),
      }]))])),
  };
  fs.writeFileSync(OUT, JSON.stringify(stats, null, 1));

  console.log(`저장: ${OUT}`);
  console.log(`기간 ${stats.period}, 비교 ${overall.n.toLocaleString()}건, 제외 ${skipped.toLocaleString()}건`);
  for (const t of TARGETS) console.log(`  ${t}등급 이내 전체 통과율 ${(stats.overall.passRate[t] * 100).toFixed(1)}%`);
  const r3 = stats.failReasons[3];
  for (const g of Object.keys(r3 || {})) {
    console.log(`  [3등급 미달 ${g}] ${r3[g].n.toLocaleString()}명, 한 항목만 부족 ${(r3[g].single / r3[g].n * 100).toFixed(1)}%`, r3[g].top.slice(0, 4));
  }
}

main();
