/*
 * 등급 계산 엔진(js/grade.js)을 실제 측정결과(측정결과 API의 '상장구분')와 대조한다.
 * 실행: node scripts/validate_engine.js
 * 입력: raw/measure/*.json (collect_measurements.py 가 저장한 원본)
 * 출력: 화면에 일치율과 흔한 불일치, data/validation.json 에 요약 저장
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeEngine } = require("../js/grade.js");

const SERVICE_DIR = path.resolve(__dirname, "..");
const RAW_DIR = path.join(SERVICE_DIR, "raw", "measure");
const OUT_SUMMARY = path.join(SERVICE_DIR, "data", "validation.json");
const OUT_MISMATCH = path.join(SERVICE_DIR, "data_work", "validation_mismatch_sample.json");
const criteria = JSON.parse(fs.readFileSync(path.join(SERVICE_DIR, "data", "criteria.json"), "utf8"));
const engine = makeEngine(criteria);

// 0 은 미측정으로 본다 (유연성은 0cm 도 실제 값이라 따로 처리)
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}
function numKeepZero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 측정결과 API 필드 → 엔진 입력 (필드 뜻은 data.go.kr 15108938 명세)
function toInput(r) {
  return {
    sex: r.test_sex, age: num(r.age_degree),
    height: num(r.item_f001), weight: num(r.item_f002), bodyFat: num(r.item_f003), bmi: num(r.item_f018),
    gripLeft: num(r.item_f007), gripRight: num(r.item_f008), relGrip: num(r.item_f028), absGrip: num(r.item_f052),
    shuttle20: num(r.item_f020), vo2max: num(r.item_f035) || num(r.item_f037),
    crossSitup: numKeepZero(r.item_f019), sitReach: numKeepZero(r.item_f012),
    run10x4: num(r.item_f021), reaction: num(r.item_f040), longJump: num(r.item_f022), airTime: num(r.item_f041),
    step2min: num(r.item_f025), walk6min: num(r.item_f024), chairStand: numKeepZero(r.item_f023),
    tug3m: num(r.item_f026), fig8: num(r.item_f027),
  };
}

function officialGrade(cert) {
  const m = String(cert || "").match(/^(\d)등급$/);
  return m ? Number(m[1]) : null; // '참가' 등은 비교에서 뺀다
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`[오류] 측정 원본 폴더가 없습니다: ${RAW_DIR}\n먼저 python3 scripts/collect_measurements.py 를 실행하세요.`);
    process.exit(1);
  }
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json")).sort();
  const stats = {};
  const confusion = {};
  const mismatches = [];
  let skipped = 0;

  for (const f of files) {
    for (const r of JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"))) {
      const official = officialGrade(r.cert_gbn);
      const input = toInput(r);
      if (official === null || !input.age || input.age < 19 || !["M", "F"].includes(input.sex)) { skipped++; continue; }
      let mine;
      try { mine = engine.evaluate(input).grade; } catch (e) { skipped++; continue; }
      const g = r.age_gbn;
      stats[g] = stats[g] || { total: 0, exact: 0, sameBand: 0 };
      stats[g].total++;
      if (mine === official) stats[g].exact++;
      // 채용에서 중요한 구분: 3등급 이상인지 아닌지
      if ((mine <= 3) === (official <= 3)) stats[g].sameBand++;
      if (mine !== official) {
        const k = `${g} 공식${official}→계산${mine}`;
        confusion[k] = (confusion[k] || 0) + 1;
        if (mismatches.length < 40) mismatches.push({ official, mine, row: r });
      }
    }
  }

  console.log(`파일 ${files.length}개, 비교 제외 ${skipped.toLocaleString()}건('참가' 등)`);
  for (const [g, s] of Object.entries(stats)) {
    console.log(`[${g}] ${s.total.toLocaleString()}건 | 등급 정확 일치 ${(100 * s.exact / s.total).toFixed(1)}% | 3등급 이상 여부 일치 ${(100 * s.sameBand / s.total).toFixed(1)}%`);
  }
  console.log("가장 흔한 불일치:", Object.entries(confusion).sort((a, b) => b[1] - a[1]).slice(0, 12));
  fs.mkdirSync(path.dirname(OUT_MISMATCH), { recursive: true });
  fs.writeFileSync(OUT_MISMATCH, JSON.stringify(mismatches, null, 1));
  fs.writeFileSync(OUT_SUMMARY, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), files: files.length, stats }, null, 1));
}

main();
