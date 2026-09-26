"""국민체력100 공식 인증기준 페이지(저장본)에서 성인·어르신 등급 기준값을 뽑아 JSON으로 만든다.

입력: data_sample/국민체력100_인증기준_원문.html  (nfa.kspo.or.kr 인증기준 페이지 저장본)
출력: service/data/criteria.json

등급 판정 규칙 근거: 문화체육관광부 고시 제2025-0027호 제6조 (2025-06-02 시행)
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
SRC_HTML = ROOT / "data_sample" / "국민체력100_인증기준_원문.html"
OUT_JSON = ROOT / "service" / "data" / "criteria.json"
SOURCE_URL = "https://nfa.kspo.or.kr/reserve/0/selectMeasureGradeItemListByAgeSe.kspo"

# 표 헤더 문구 → 내부 항목 키, 단위, 방향(높을수록 좋음=up / 낮을수록 좋음=down)
ITEM_MAP = {
    "20m 왕복 오래달리기 (회)": ("shuttle20", "회", "up"),
    "트레드밀/ 스텝검사 (ml/kg/min)": ("vo2max", "ml/kg/min", "up"),
    "상대악력 (%)": ("relGrip", "%", "up"),
    "교차윗몸 일으키기 (회)": ("crossSitup", "회", "up"),
    "앉아 윗몸 앞으로 굽히기 (cm)": ("sitReach", "cm", "up"),
    "앉아윗몸 앞으로 굽히기 (cm)": ("sitReach", "cm", "up"),
    "10미터 왕복 달리기 (초)": ("run10x4", "초", "down"),
    "반응시간 (초)": ("reaction", "초", "down"),
    "제자리 멀리뛰기 (cm)": ("longJump", "cm", "up"),
    "체공시간 (초)": ("airTime", "초", "up"),
    "2분 제자리 걷기 (회)": ("step2min", "회", "up"),
    "6분 걷기 (m)": ("walk6min", "m", "up"),
    "의자에 앉았다 일어서기 (30초/회)": ("chairStand", "회", "up"),
    "의자에 앉았다 일어서기(30초/회)": ("chairStand", "회", "up"),
    "3m (초)": ("tug3m", "초", "down"),
    "8자보행 (초)": ("fig8", "초", "down"),
    "8자보행(초)": ("fig8", "초", "down"),
    "절대악력(㎏)": ("absGrip", "kg", "up"),
}
BODY_COLS = {"BMI (㎏/㎡)": "bmi", "체지방률 (%)": "bodyFat"}

# 페이지 안 표 순서 (조사로 확인: 각 등급마다 [헤더 전용 표, 남, 여] 3개씩)
ADULT_TABLES = {1: (28, 29), 2: (31, 32), 3: (34, 35)}
SENIOR_TABLES = {1: (37, 38), 2: (40, 41), 3: (43, 44), 4: (46, 47), 5: (49, 50)}


def cell_text(cell):
    return re.sub(r"\s+", " ", cell.get_text(" ", strip=True))


def parse_range(text):
    """'10%초과 27%미만', '18.5이상 25미만' 같은 문구를 {min, max, minInclusive, maxInclusive}로."""
    nums = re.findall(r"\d+(?:\.\d+)?", text)
    if len(nums) != 2:
        raise ValueError(f"신체조성 범위를 해석하지 못함: {text!r}")
    return {
        "min": float(nums[0]),
        "max": float(nums[1]),
        "minInclusive": "이상" in text,
        "maxInclusive": "이하" in text,
        "text": text,
    }


def parse_table(table, sex):
    """한 성별 표를 {연령구간: {항목키: 기준값}} 로 바꾼다. 신체조성은 따로 반환."""
    rows = table.find_all("tr")
    headers = [cell_text(c) for c in rows[2].find_all(["td", "th"])]
    for h in headers:
        if h not in ITEM_MAP and h not in BODY_COLS:
            raise ValueError(f"모르는 측정항목 헤더: {h!r}")

    by_age, body = {}, {}
    for tr in rows[3:]:
        cells = [cell_text(c) for c in tr.find_all(["td", "th"])]
        if cells and cells[0] in ("남", "여"):
            if cells[0] != sex:
                raise ValueError(f"성별이 예상과 다름: 기대 {sex}, 실제 {cells[0]}")
            cells = cells[1:]
        age, values = cells[0], cells[1:]
        item = {}
        for header, value in zip(headers, values):
            if header in BODY_COLS:
                body[BODY_COLS[header]] = parse_range(value)
            else:
                item[ITEM_MAP[header][0]] = float(value)
        by_age[age] = item
    return by_age, body


def build(tables, table_index):
    grades = {}
    for grade, (male_idx, female_idx) in table_index.items():
        grades[str(grade)] = {}
        for sex, idx in (("M", male_idx), ("F", female_idx)):
            by_age, body = parse_table(tables[idx], "남" if sex == "M" else "여")
            grades[str(grade)][sex] = {"byAge": by_age}
            if body:
                grades[str(grade)][sex]["bodyComposition"] = body
    return grades


def main():
    if not SRC_HTML.exists():
        sys.exit(f"[오류] 인증기준 원문 파일이 없습니다: {SRC_HTML}")
    tables = BeautifulSoup(SRC_HTML.read_text(encoding="utf-8"), "html.parser").find_all("table")
    if len(tables) != 51:
        sys.exit(f"[오류] 표 개수가 51개가 아닙니다({len(tables)}개). 페이지 구조가 바뀌었는지 확인하세요.")

    # 화면에 보일 이름 (표 헤더가 너무 짧은 항목만 바꾼다)
    display_names = {"tug3m": "의자에 앉아 3m 표적 돌아오기", "vo2max": "트레드밀/스텝검사(VO2max)"}
    items = {}
    for label, (key, unit, d) in ITEM_MAP.items():
        name = display_names.get(key) or re.sub(r"\s*\(.*\)$", "", label).strip()
        items.setdefault(key, {"label": name, "unit": unit, "direction": d})
    result = {
        "source": SOURCE_URL,
        "rule": "문화체육관광부 고시 제2025-0027호 제6조 (2025-06-02 시행)",
        "items": items,
        "adult": build(tables, ADULT_TABLES),
        "senior": build(tables, SENIOR_TABLES),
    }

    # 검증: 조사 때 확인한 값과 맞는지 몇 개 대조
    checks = [
        (result["adult"]["1"]["M"]["byAge"]["19~24"]["shuttle20"], 62),
        (result["adult"]["3"]["M"]["byAge"]["19~24"]["relGrip"], 51.8),
        (result["adult"]["1"]["F"]["byAge"]["60~64"]["longJump"], 120),
        (result["senior"]["4"]["M"]["byAge"]["65~69"]["absGrip"], 30.3),
    ]
    for got, expected in checks:
        if got != expected:
            sys.exit(f"[오류] 검증 실패: {got} != {expected}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    ages = list(result["adult"]["1"]["M"]["byAge"].keys())
    print(f"저장 완료: {OUT_JSON}")
    print(f"성인 연령구간 {len(ages)}개: {ages}")
    print(f"어르신 등급: {list(result['senior'].keys())}")
    print("성인 3등급 신체조성(남):", result["adult"]["3"]["M"].get("bodyComposition"))


if __name__ == "__main__":
    main()
