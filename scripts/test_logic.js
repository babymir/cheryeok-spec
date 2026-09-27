/*
 * 핵심 계산 테스트 (등급 엔진·간이 진단·공고 판정·일정)
 * 실행: node scripts/test_logic.js   → 모두 통과하면 "테스트 N개 통과"
 * 기대값은 공식 기준표(data/criteria.json)와 2026-09-27 에 만든 data/quick.json 기준이다.
 */
"use strict";
const assert = require("assert");
const path = require("path");
const SERVICE_DIR = path.resolve(__dirname, "..");
const criteria = require(path.join(SERVICE_DIR, "data", "criteria.json"));
const { makeEngine } = require(path.join(SERVICE_DIR, "js", "grade.js"));
const { makeQuick } = require(path.join(SERVICE_DIR, "js", "quick.js"));
const Jobs = require(path.join(SERVICE_DIR, "js", "jobs.js"));
const Schedule = require(path.join(SERVICE_DIR, "js", "schedule.js"));

const engine = makeEngine(criteria);
const quick = makeQuick(require(path.join(SERVICE_DIR, "data", "quick.json")), engine, criteria);
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`[실패] ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

// ---- 등급 엔진 ----
test("예시 기록(27세 남)은 근지구력 4회 부족으로 4등급", () => {
  const r = engine.evaluate({ sex: "M", age: 27, height: 174, weight: 72, bodyFat: 19, gripLeft: 38.5, gripRight: 40.2, shuttle20: 36, crossSitup: 34, sitReach: 9.5, longJump: 212, run10x4: 11.2 });
  assert.strictEqual(r.grade, 4);
  const g = engine.gaps(r, 3);
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].item, "crossSitup");
  assert.strictEqual(g[0].gap, 4);
});

// ---- 간이 진단 ----
test("윗몸일으키기 미달이면 3등급 가능성 0%, 기준까지 올리면 크게 오름", () => {
  const d = quick.diagnose({ sex: "M", age: 27, height: 174, weight: 72, crossSitup: 34, sitReach: 9.5 }, 3);
  assert.ok(d.ok);
  assert.strictEqual(d.now.rate, 0);
  assert.ok(d.ifFixed.rate > 0.8, "올린 뒤 가능성 " + d.ifFixed.rate);
  assert.strictEqual(d.items[0].gap, 4);
});
test("두 항목 모두 넘으면 모자란 항목 없음", () => {
  const d = quick.diagnose({ sex: "M", age: 27, height: 174, weight: 72, crossSitup: 45, sitReach: 12 }, 3);
  assert.ok(d.items.every((i) => !i.short));
  assert.strictEqual(d.ifFixed, null);
  assert.ok(d.now.rate > 0.8);
});
test("65세 이상·기록 누락은 안내 메시지", () => {
  assert.strictEqual(quick.diagnose({ sex: "F", age: 70, height: 160, weight: 60, crossSitup: 20, sitReach: 10 }, 3).ok, false);
  assert.strictEqual(quick.diagnose({ sex: "F", age: 30, height: 160, weight: 60, crossSitup: 20 }, 3).ok, false);
});
test("3등급 기준선은 측정자 백분위로도 상위 70~80% 근처", () => {
  const c = engine.cutoff("adult", 3, "M", "25~29", "crossSitup");
  const p = quick.percentile("adult", "M", "25~29", "crossSitup", c);
  assert.ok(p.top >= 65 && p.top <= 85, "상위 " + p.top + "%");
});

// ---- 공고 판정 ----
const job = { maxGrade: 2, gradeText: "2등급 이상", applyStart: "2026-11-09", applyEnd: "2026-11-19", valid: { kind: "since", date: "2026-07-08" } };
test("접수 상태 계산", () => {
  assert.strictEqual(Jobs.statusOf(job, new Date(2026, 8, 27)).key, "soon");
  assert.strictEqual(Jobs.statusOf(job, new Date(2026, 10, 10)).key, "open");
  assert.strictEqual(Jobs.statusOf(job, new Date(2026, 10, 20)).key, "closed");
});
test("내 인증서 판정: 등급·유효기간", () => {
  assert.strictEqual(Jobs.checkCert(job, 3, new Date(2026, 8, 1)).key, "grade");
  assert.strictEqual(Jobs.checkCert(job, 2, new Date(2026, 5, 1)).key, "expired");
  assert.strictEqual(Jobs.checkCert(job, 1, new Date(2026, 8, 1)).key, "ok");
  const sixMonths = { maxGrade: 3, applyEnd: "2026-10-06", valid: { kind: "months", months: 6, base: "2026-10-08" } };
  assert.strictEqual(Jobs.checkCert(sixMonths, 3, new Date(2026, 3, 7)).key, "expired"); // 2026.4.7 < 4.8
  assert.strictEqual(Jobs.checkCert(sixMonths, 3, new Date(2026, 3, 8)).key, "ok");
});

// ---- 일정 ----
test("고정 인정일(validFrom)이 있으면 그 날 이후로 측정 기간 시작", () => {
  const p = Schedule.plan({ deadline: new Date(2026, 10, 19), validFrom: new Date(2026, 11, 1), today: new Date(2026, 8, 27) });
  assert.strictEqual(p.ok, false); // 인정 시작일이 마감보다 늦음
  const p2 = Schedule.plan({ deadline: new Date(2026, 10, 19), validFrom: new Date(2026, 6, 8), today: new Date(2026, 8, 27) });
  assert.ok(p2.ok);
  assert.strictEqual(p2.windowStart.getDate(), 28); // 내일부터
  assert.strictEqual(p2.windowEnd.getDate(), 12); // 마감 7일 전
});

console.log(process.exitCode ? `실패가 있습니다 (통과 ${passed}개)` : `테스트 ${passed}개 통과`);
