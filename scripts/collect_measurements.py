"""국민체력100 체력인증센터 측정결과 API(data.go.kr 15108938)에서 등급 개편 이후 측정 기록을 모은다.

- 대상: 성인·어르신, 측정연월 2025-06 ~ 현재 (1~6등급 체계 시행 2025-06-02 이후)
- 페이지마다 raw/measure/<연령구분>_<페이지>.json 으로 저장 → 중단돼도 다시 실행하면 이어서 받는다.
- 다 받으면 필요한 열만 골라 data_work/measurements.csv 로 합친다.

실행: python3 scripts/collect_measurements.py
인증키: service/.env 의 DATA_GO_KR_KEY_ENCODED (URL 인코딩된 키)
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = SERVICE_DIR / ".env"
RAW_DIR = SERVICE_DIR / "raw" / "measure"
OUT_CSV = SERVICE_DIR / "data_work" / "measurements.csv"

API_URL = "https://apis.data.go.kr/B551014/SRVC_NFA_TEST_RESULT/TODZ_NFA_TEST_RESULT_NEW"
START_YM = "202506"
END_YM = "202612"
AGE_GROUPS = ["성인", "어르신"]
ROWS_PER_PAGE = 1000
RETRY = 4
SLEEP_SEC = 0.3

# API 필드 → 사람이 읽는 열 이름 (data.go.kr 명세에서 확인)
FIELDS = {
    "test_ym": "측정연월", "test_sex": "성별", "age_degree": "나이", "age_gbn": "연령구분",
    "cert_gbn": "등급",
    "item_f001": "신장", "item_f002": "체중", "item_f003": "체지방률", "item_f018": "BMI",
    "item_f007": "악력_좌", "item_f008": "악력_우", "item_f028": "상대악력", "item_f052": "절대악력",
    "item_f019": "교차윗몸일으키기", "item_f012": "앉아윗몸앞으로굽히기",
    "item_f020": "왕복오래달리기", "item_f030": "왕복오래달리기_VO2max",
    "item_f035": "트레드밀_VO2max", "item_f037": "스텝검사_VO2max",
    "item_f021": "10m왕복달리기", "item_f040": "반응시간",
    "item_f022": "제자리멀리뛰기", "item_f041": "성인체공시간",
    "item_f023": "의자앉았다일어서기", "item_f024": "6분걷기", "item_f025": "2분제자리걷기",
    "item_f026": "3m표적돌아오기", "item_f027": "8자보행",
}


def load_key():
    if not ENV_FILE.exists():
        sys.exit(f"[오류] 인증키 파일이 없습니다: {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("DATA_GO_KR_KEY_ENCODED="):
            return line.split("=", 1)[1].strip()
    sys.exit("[오류] .env 에 DATA_GO_KR_KEY_ENCODED 항목이 없습니다.")


def fetch_page(key, age_gbn, page):
    params = urllib.parse.urlencode({
        "pageNo": page, "numOfRows": ROWS_PER_PAGE, "resultType": "json",
        "starttest_ym": START_YM, "endtest_ym": END_YM, "age_gbn": age_gbn,
    })
    url = f"{API_URL}?serviceKey={key}&{params}"  # 키는 이미 인코딩돼 있으므로 그대로 붙인다
    last_error = None
    for attempt in range(1, RETRY + 1):
        try:
            with urllib.request.urlopen(url, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            header = data["response"]["header"]
            if header.get("resultCode") != "00":
                raise RuntimeError(f"API 오류 응답: {header}")
            return data["response"]["body"]
        except Exception as e:  # 네트워크·파싱 오류는 재시도
            last_error = e
            time.sleep(2 * attempt)
    raise RuntimeError(f"{age_gbn} {page}쪽을 {RETRY}번 시도했지만 실패: {last_error}")


def collect(key):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for age_gbn in AGE_GROUPS:
        first = fetch_page(key, age_gbn, 1)
        total = int(first["totalCount"])
        pages = (total + ROWS_PER_PAGE - 1) // ROWS_PER_PAGE
        print(f"[{age_gbn}] 전체 {total:,}건, {pages}쪽", flush=True)
        for page in range(1, pages + 1):
            path = RAW_DIR / f"{age_gbn}_{page:04d}.json"
            if path.exists():
                continue
            body = first if page == 1 else fetch_page(key, age_gbn, page)
            items = (body.get("items") or {}).get("item") or []
            slim = [{k: it.get(k) for k in FIELDS} for it in items]
            path.write_text(json.dumps(slim, ensure_ascii=False), encoding="utf-8")
            if page % 20 == 0 or page == pages:
                print(f"  {age_gbn} {page}/{pages}쪽 저장", flush=True)
            time.sleep(SLEEP_SEC)


def merge():
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(FIELDS.values())
        for path in sorted(RAW_DIR.glob("*.json")):
            for row in json.loads(path.read_text(encoding="utf-8")):
                writer.writerow([row.get(k) for k in FIELDS])
                count += 1
    print(f"합치기 완료: {OUT_CSV} ({count:,}행)")


if __name__ == "__main__":
    collect(load_key())
    merge()
