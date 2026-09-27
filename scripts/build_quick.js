/*
 * 집에서 하는 간이 진단용 통계(data/quick.json)를 만든다.
 *
 * 1) 조건별 통과율표: 성별·연령대·윗몸일으키기 수준·유연성 수준·BMI 범위가
 *    같았던 실제 측정자 중 목표 등급 이상을 받은 비율. 성인(19~64세)만.
 * 2) 백분위표: 성별·연령대별로 각 항목 기록이 측정자 중 어디쯤인지 (5% 단위)
 * 3) 아깝게 떨어진 사람: 3등급 미달 성인 중 한 항목만 모자란 사람의 부족량
 * 4) 검증: 2026년 5월까지 기록으로 표를 만들고 6월 이후 기록으로 맞히는지 확인
 *
 * 실행: node scripts/build_quick.js   (먼저 collect_measurements.py 로 raw/measure 를 채워야 한다)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeEngine } = require("../js/grade.js");

const SERVICE_DIR = path.resolve(__dirname, "..");
const RAW_DIR = path.join(SERVICE_DIR, "raw", "measure");
const OUT = path.join(SERVICE_DIR, "data", "quick.json");
const TEST_FROM_YM = "202606"; // 이 달부터는 검증용으로만 쓴다
const MIN_CELL_N = 30; // 이보다 적은 칸은 연령대를 합친 표로 대신한다
const TARGETS = [1, 2, 3, 4];
const PERCENTILE_STEP = 5;
const PERCENTILE_ITEMS = {
  adult: ["crossSitup", "sitReach", "longJump", "relGrip", "shuttle20", "run10x4", "vo2max"],
  senior: ["step2min", "chairStand", "sitReach", "tug3m", "fig8", "absGrip"],
};

const criteria = JSON.parse(fs.readFileSync(path.join(SERVICE_DIR, "data", "criteria.json"), "utf8"));
const engine = makeEngine(criteria);
const BMI_RANGE = criteria.adult["3"].M.bodyComposition.bmi; // 남녀 같은 값 (18.5 이상 25 미만)

function num(v, keepZero) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 0 && !keepZero ? null : n;
}

// validate_engine.js 와 같은 필드 대응 (data.go.kr 15108938 명세)
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

/** 한 항목의 수준: 1·2·3 = 그 등급 기준 이상, 0 = 3등급 기준 미달, "x" = 기록 없음 */
function levelOf(sex, ageKey, item, value) {
  if (value === null || value === undefined) return "x";
  const dir = engine.directionOf(item);
  for (const g of [1, 2, 3]) {
    const c = engine.cutoff("adult", g, sex, ageKey, item);
    if (c !== null && (dir === "down" ? value <= c : value >= c)) return g;
  }
  return 0;
}

function bmiOf(input) {
  if (input.bmi) return input.bmi;
  if (input.height && input.weight) return input.weight / Math.pow(input.height / 100, 2);
  return null;
}

function inBmiRange(bmi) {
  if (bmi === null) return "x";
  const okMin = BMI_RANGE.minInclusive ? bmi >= BMI_RANGE.min : bmi > BMI_RANGE.min;
  const okMax = BMI_RANGE.maxInclusive ? bmi <= BMI_RANGE.max : bmi < BMI_RANGE.max;
  return okMin && okMax ? 1 : 0;
}

/**
 * 칸 이름: 성별|연령대|윗몸|유연성|BMI (연령대 '*' = 전 연령 합산)
 * 제자리멀리뛰기도 시험했으나 적중률이 오르지 않아(2026-09-27 검증) 뺐다.
 */
function cellKeys(rec) {
  const tail = [rec.su, rec.fl, rec.bmi].join("|");
  return [`${rec.sex}|${rec.ageKey}|${tail}`, `${rec.sex}|*|${tail}`];
}

function addTo(table, key, official) {
  const cell = table[key] || (table[key] = [0, 0, 0, 0, 0]); // [n, 1등급 이내, 2등급 이내, 3등급 이내, 4등급 이내]
  cell[0]++;
  TARGETS.forEach((t, i) => { if (official <= t) cell[i + 1]++; });
}

function buildTable(records) {
  const table = {};
  for (const rec of records) {
    if (rec.su === "x" || rec.fl === "x" || rec.bmi === "x") continue;
    for (const k of cellKeys(rec)) addTo(table, k, rec.official);
  }
  return table;
}

/** 표에서 통과율 찾기: 연령대 칸이 작으면 전 연령 칸으로 */
function lookup(table, rec, target) {
  for (const k of cellKeys(rec)) {
    const cell = table[k];
    if (cell && cell[0] >= MIN_CELL_N) return cell[target] / cell[0];
  }
  return null;
}

function evaluateSplit(train, test) {
  const table = buildTable(train);
  const out = {};
  for (const t of TARGETS) {
    let n = 0, correct = 0, covered = 0;
    const buckets = Array.from({ length: 10 }, () => [0, 0]);
    for (const rec of test) {
      if (rec.su === "x" || rec.fl === "x" || rec.bmi === "x") continue;
      n++;
      const p = lookup(table, rec, t);
      if (p === null) continue;
      covered++;
      const pass = rec.official <= t ? 1 : 0;
      if ((p >= 0.5 ? 1 : 0) === pass) correct++;
      const b = buckets[Math.min(9, Math.floor(p * 10))];
      b[0]++;
      b[1] += pass;
    }
    out[t] = {
      n, covered, accuracy: covered ? round(correct / covered, 4) : null,
      calibration: buckets.map((b, i) => ({ from: i / 10, n: b[0], actual: b[0] ? round(b[1] / b[0], 3) : null })),
    };
  }
  return out;
}

function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function quantiles(values) {
  values.sort((a, b) => a - b);
  const out = [];
  for (let p = PERCENTILE_STEP; p < 100; p += PERCENTILE_STEP) {
    out.push(values[Math.floor((values.length - 1) * (p / 100))]);
  }
  return out;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`[오류] 측정 원본 폴더가 없습니다: ${RAW_DIR}\n먼저 python3 scripts/collect_measurements.py 를 실행하세요.`);
    process.exit(1);
  }
  const records = [];
  const pctValues = {};
  const nearMiss = { failN: 0, singleN: 0, unknownN: 0, items: {} };
  let skipped = 0;
  let minYm = "999999", maxYm = "000000";

  for (const file of fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf8"))) {
      const m = String(r.cert_gbn || "").match(/^(\d)등급$/);
      const input = toInput(r);
      if (!m || !input.age || input.age < 19 || !["M", "F"].includes(input.sex)) { skipped++; continue; }
      let result;
      try { result = engine.evaluate(input); } catch (e) { skipped++; continue; }
      const official = Number(m[1]);
      if (r.test_ym < minYm) minYm = r.test_ym;
      if (r.test_ym > maxYm) maxYm = r.test_ym;

      // 백분위용 값 모으기 (성인·어르신 모두)
      const pk = `${result.group}|${input.sex}|${result.ageKey}`;
      const bucket = pctValues[pk] || (pctValues[pk] = {});
      for (const item of PERCENTILE_ITEMS[result.group]) {
        const v = result.input[item];
        if (v !== null && v !== undefined) (bucket[item] = bucket[item] || []).push(v);
      }

      if (result.group !== "adult") continue;
      records.push({
        ym: r.test_ym, sex: input.sex, ageKey: result.ageKey, official,
        su: levelOf(input.sex, result.ageKey, "crossSitup", input.crossSitup),
        fl: levelOf(input.sex, result.ageKey, "sitReach", input.sitReach),
        bmi: inBmiRange(bmiOf(input)),
      });

      // 3등급 미달 성인 중 한 항목만 모자란 사람
      if (official > 3) {
        nearMiss.failN++;
        const g = engine.gaps(result, 3);
        // 기록이 비어 있어 '모자람'으로 잡힌 경우(value null)는 부족량을 알 수 없으므로 뺀다
        if (g.length === 1 && (g[0].value !== null || g[0].factor === "body")) {
          nearMiss.singleN++;
          const key = g[0].factor === "body" ? "body" : g[0].item;
          const it = nearMiss.items[key] || (nearMiss.items[key] = { label: g[0].label, gaps: [] });
          if (g[0].gap !== null) it.gaps.push(g[0].gap);
          else it.count = (it.count || 0) + 1; // 신체조성은 범위 밖이라 부족량 대신 인원만 센다
        } else if (g.length === 1) {
          nearMiss.unknownN++;
        }
      }
    }
  }

  const train = records.filter((r) => r.ym < TEST_FROM_YM);
  const test = records.filter((r) => r.ym >= TEST_FROM_YM);
  const validation = evaluateSplit(train, test);

  // 화면용 표는 전체 기록으로 만든다. 작은 칸은 빼서 파일을 줄인다.
  const full = buildTable(records);
  const cells = {};
  for (const [k, v] of Object.entries(full)) if (v[0] >= MIN_CELL_N) cells[k] = v;

  const percentiles = {};
  for (const [k, items] of Object.entries(pctValues)) {
    percentiles[k] = {};
    for (const [item, values] of Object.entries(items)) {
      if (values.length >= 100) percentiles[k][item] = { n: values.length, q: quantiles(values) };
    }
  }

  const q = (a, p) => a[Math.floor((a.length - 1) * p)];
  const nearMissOut = {
    failN: nearMiss.failN, singleN: nearMiss.singleN, unknownN: nearMiss.unknownN,
    items: Object.entries(nearMiss.items).map(([item, v]) => {
      const gaps = v.gaps.sort((a, b) => a - b);
      return {
        item, label: v.label, n: gaps.length + (v.count || 0),
        median: gaps.length ? round(q(gaps, 0.5), 2) : null,
        q25: gaps.length ? round(q(gaps, 0.25), 2) : null,
        q75: gaps.length ? round(q(gaps, 0.75), 2) : null,
      };
    }).sort((a, b) => b.n - a.n),
  };

  const out = {
    builtAt: new Date().toISOString().slice(0, 10),
    period: `${minYm.slice(0, 4)}.${Number(minYm.slice(4))} ~ ${maxYm.slice(0, 4)}.${Number(maxYm.slice(4))}`,
    adultN: records.length,
    minCellN: MIN_CELL_N,
    percentileStep: PERCENTILE_STEP,
    cellFormat: "성별|연령대(*=전연령)|윗몸수준|유연성수준|BMI범위(1=안,0=밖) → [인원, 1등급이내, 2등급이내, 3등급이내, 4등급이내]. 수준 1~3=그 등급 기준 이상, 0=3등급 기준 미달",
    cells,
    percentiles,
    nearMiss: nearMissOut,
    validation: { trainN: train.length, testN: test.length, testFrom: TEST_FROM_YM, result: validation },
  };
  fs.writeFileSync(OUT, JSON.stringify(out));

  console.log(`저장: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
  console.log(`기간 ${out.period}, 성인 ${records.length.toLocaleString()}건, 제외 ${skipped.toLocaleString()}건, 표 칸 ${Object.keys(cells).length}개`);
  console.log(`검증: 학습 ${train.length.toLocaleString()}건(~${TEST_FROM_YM} 전) / 검증 ${test.length.toLocaleString()}건`);
  for (const t of TARGETS) {
    const v = validation[t];
    console.log(`  ${t}등급 이내: 적중 ${(v.accuracy * 100).toFixed(1)}% (${v.covered.toLocaleString()}/${v.n.toLocaleString()}건)`);
  }
  console.log("  보정표(3등급):", validation[3].calibration.map((b) => `${b.from * 100}%대 ${b.n}명→${b.actual === null ? "-" : (b.actual * 100).toFixed(0) + "%"}`).join(" / "));
  console.log(`아깝게 떨어진 사람: 3등급 미달 ${nearMiss.failN.toLocaleString()}명 중 한 항목만 부족 ${nearMiss.singleN.toLocaleString()}명 (기록이 비어 제외 ${nearMiss.unknownN.toLocaleString()}명)`);
  nearMissOut.items.forEach((i) => console.log(`  ${i.label}(${i.item}) ${i.n.toLocaleString()}명, 부족량 중앙값 ${i.median}`));
}

main();
