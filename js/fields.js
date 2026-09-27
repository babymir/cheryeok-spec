/*
 * 입력 칸 정의: 성인(19~64세)과 어르신(65세 이상)이 재는 항목이 다르다.
 * factor 는 grade.js 의 체력요인 키, videoFactors 는 동영상 API 의 체력요인명(ftns_fctr_nm)과 맞춘다.
 */
(function (root) {
  "use strict";

  var ADULT_FIELDS = [
    { name: "gripLeft", label: "악력 왼손", unit: "kg", step: "0.1", factor: "strength", how: "악력계로 2번 재서 높은 값" },
    { name: "gripRight", label: "악력 오른손", unit: "kg", step: "0.1", factor: "strength", how: "상대악력 = 높은 쪽 ÷ 몸무게 × 100" },
    { name: "shuttle20", label: "20m 왕복오래달리기", unit: "회", step: "1", factor: "cardio", how: "신호음에 맞춰 20m 왕복한 횟수" },
    { name: "crossSitup", label: "교차윗몸일으키기", unit: "회/1분", step: "1", factor: "endurance", how: "팔꿈치로 반대 무릎 닿기, 1분" },
    { name: "sitReach", label: "앉아윗몸앞으로굽히기", unit: "cm", step: "0.1", factor: "flexibility", how: "발끝이 0, 넘어가면 +" },
    { name: "longJump", label: "제자리멀리뛰기", unit: "cm", step: "1", factor: "power", how: "두 발 모아 뛰어 뒤꿈치까지" },
    { name: "run10x4", label: "10m 4회 왕복달리기", unit: "초", step: "0.1", factor: "agility", how: "선택 · 민첩성" }
  ];

  var SENIOR_FIELDS = [
    { name: "gripLeft", label: "악력 왼손", unit: "kg", step: "0.1", factor: "upper", how: "상대악력·절대악력 모두 계산" },
    { name: "gripRight", label: "악력 오른손", unit: "kg", step: "0.1", factor: "upper", how: "" },
    { name: "step2min", label: "2분 제자리걷기", unit: "회", step: "1", factor: "cardio", how: "무릎을 정해진 높이까지 올린 횟수" },
    { name: "chairStand", label: "의자에 앉았다 일어서기", unit: "회/30초", step: "1", factor: "lower", how: "팔짱 끼고 30초" },
    { name: "sitReach", label: "앉아윗몸앞으로굽히기", unit: "cm", step: "0.1", factor: "flexibility", how: "" },
    { name: "tug3m", label: "의자에 앉아 3m 표적 돌아오기", unit: "초", step: "0.1", factor: "balance", how: "일어나 3m 돌아와 앉기" },
    { name: "fig8", label: "8자보행", unit: "초", step: "0.1", factor: "coordination", how: "" }
  ];

  // 등급 계산 체력요인 → 동영상 API 체력요인명
  var VIDEO_FACTORS = {
    cardio: ["심폐지구력", "전신지구력", "유산소"],
    strength: ["근력", "근력/근지구력"],
    upper: ["근력", "근력/근지구력"],
    lower: ["근력", "근력/근지구력"],
    endurance: ["근력/근지구력", "근력"],
    flexibility: ["유연성"],
    agility: ["민첩성", "민첩성/순발력"],
    power: ["순발력", "민첩성/순발력"],
    balance: ["평형성"],
    coordination: ["협응력", "협응성"]
  };

  // 같은 체력요인 영상 중 먼저 보여 줄 운동 부위 (동영상 API 의 trng_mscl_part)
  var VIDEO_PREFER = {
    endurance: ["복부"],
    flexibility: ["뒤쪽 넓적다리", "척추", "엉덩이"],
    strength: ["아래팔", "위팔", "등"],
    upper: ["아래팔", "위팔", "등"],
    lower: ["넓적다리", "엉덩이", "종아리"],
    power: ["넓적다리", "엉덩이", "종아리"]
  };

  // 집에서 할 수 있는 영상의 도구 (동영상 API 의 tool 값). 이 밖의 도구나 헬스장 영상은 뒤로 미룬다
  var HOME_TOOLS = ["", "매트", "의자", "수건", "베개", "소파", "물병", "계단", "테이블", "밴드"];

  // 화면 확인용 예시 기록 (27세 남성, 3등급 근처)
  var SAMPLE = {
    sex: "M", age: 27, height: 174, weight: 72, bodyFat: 19,
    gripLeft: 38.5, gripRight: 40.2, shuttle20: 36, crossSitup: 34, sitReach: 9.5, longJump: 212, run10x4: 11.2
  };

  root.Fields = { ADULT_FIELDS: ADULT_FIELDS, SENIOR_FIELDS: SENIOR_FIELDS, VIDEO_FACTORS: VIDEO_FACTORS, VIDEO_PREFER: VIDEO_PREFER, HOME_TOOLS: HOME_TOOLS, SAMPLE: SAMPLE };
})(this);
