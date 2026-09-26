"""국민체력100 운동처방 동영상(15108846)과 체력인증센터 측정건수(15114286)를 받아 서비스용 JSON으로 만든다.

출력
- service/data/videos.json  : 동영상 1개당 1줄 (장면 이미지 중복 제거), 체력요인·대상·난이도 포함
- service/data/centers.json : 센터별 주소, 월별 측정건수, 최근 12개월 평균 대비 월별 혼잡도

실행: python3 scripts/collect_videos_centers.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = SERVICE_DIR / ".env"
RAW_DIR = SERVICE_DIR / "raw"
DATA_DIR = SERVICE_DIR / "data"

VIDEO_API = "https://apis.data.go.kr/B551014/SRVC_TODZ_VDO_PKG/TODZ_VDO_TRNG_GUIDE_I"
CENTER_API = "https://apis.data.go.kr/B551014/SRVC_TODZ_NFA_TEST_CENTER_CNT/TODZ_NFA_TEST_CENTER_CNT"
ROWS_PER_PAGE = 1000
ACTIVE_SINCE = "202601"   # 이 달 이후 측정 기록이 있는 센터만 운영 중으로 본다
EXCLUDE_WORDS = ["테스트", "온라인", "번 업체", "출장", "버스"]  # 실제 방문 센터가 아닌 항목
# 주소 앞부분 → 지역명 (행정구역 개편 표기 통일)
REGION_PREFIX = [
    ("서울", "서울"), ("부산", "부산"), ("대구", "대구"), ("인천", "인천"), ("광주광역시", "광주·전남"),
    ("전남광주통합특별시", "광주·전남"), ("전라남도", "광주·전남"), ("대전", "대전"), ("울산", "울산"), ("세종", "세종"),
    ("경기", "경기"), ("강원", "강원"), ("충청북도", "충북"), ("충북", "충북"), ("청주시", "충북"),
    ("충청남도", "충남"), ("충남", "충남"), ("전라북도", "전북"), ("전북", "전북"),
    ("경상북도", "경북"), ("경북", "경북"), ("경상남도", "경남"), ("경남", "경남"), ("제주", "제주"),
]
# 주소가 비어 있는 센터 (이름으로 지역 판단, 2026-09 데이터 기준 확인)
REGION_BY_NAME = {
    "구의": "서울", "군자": "서울", "금천": "서울", "도봉": "서울", "동대문": "서울", "마포망원": "서울",
    "서대문구보건소": "서울", "서울시": "서울", "송파구보건소": "서울", "영등포": "서울", "은평": "서울",
    "중구을지": "서울", "진주(자체운영)": "경남",
}


def region_of(name, address):
    for prefix, region in REGION_PREFIX:
        if address.startswith(prefix):
            return region
    return REGION_BY_NAME.get(name)
VIDEO_BASE = "https://openapi.kspo.or.kr/web/video/"   # API가 주는 http 주소를 https로 바꿔 쓴다
IMAGE_BASE = "https://openapi.kspo.or.kr/web/image/"


def load_key():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("DATA_GO_KR_KEY_ENCODED="):
            return line.split("=", 1)[1].strip()
    sys.exit("[오류] .env 에 DATA_GO_KR_KEY_ENCODED 항목이 없습니다.")


def fetch_all(key, api_url, name):
    """모든 쪽을 받아 raw/<name>.json 에 저장. 이미 있으면 다시 받지 않는다."""
    cache = RAW_DIR / f"{name}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    rows, page, total = [], 1, None
    while total is None or len(rows) < total:
        query = urllib.parse.urlencode({"pageNo": page, "numOfRows": ROWS_PER_PAGE, "resultType": "json"})
        with urllib.request.urlopen(f"{api_url}?serviceKey={key}&{query}", timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))["response"]
        if body["header"]["resultCode"] != "00":
            sys.exit(f"[오류] {name} API 오류: {body['header']}")
        total = int(body["body"]["totalCount"])
        items = (body["body"].get("items") or {}).get("item") or []
        if not items:
            break
        rows.extend(items)
        print(f"  {name}: {len(rows):,}/{total:,}", flush=True)
        page += 1
        time.sleep(0.3)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows


def build_videos(rows):
    videos = {}
    for r in rows:
        file_nm = r.get("file_nm")
        if not file_nm:
            continue
        v = videos.setdefault(file_nm, {
            "title": r.get("vdo_ttl_nm"), "exercise": r.get("trng_nm"),
            "factor": r.get("ftns_fctr_nm"), "level": r.get("ftns_lvl_nm"),
            "target": r.get("aggrp_nm"), "place": r.get("trng_plc_nm"),
            "tool": r.get("tool_nm"), "seconds": r.get("vdo_len"),
            "part": r.get("trng_mscl_part") or "",
            "desc": r.get("vdo_desc"), "url": VIDEO_BASE + file_nm, "thumb": None,
        })
        if v["thumb"] is None and r.get("img_file_nm"):
            folder = file_nm.rsplit(".", 1)[0]
            v["thumb"] = f"{IMAGE_BASE}{folder}/{r['img_file_nm']}"
    return list(videos.values())


def build_centers(rows):
    centers = defaultdict(lambda: {"monthly": {}})
    for r in rows:
        name = (r.get("center_nm") or "").strip()
        if not name:
            continue
        c = centers[name]
        c["name"] = name
        c["address"] = " ".join(x.strip() for x in (r.get("center_addr1"), r.get("center_addr2")) if x)
        ym, cnt = r.get("test_ym"), r.get("test_cnt")
        if ym and cnt is not None:
            c["monthly"][ym] = c["monthly"].get(ym, 0) + int(cnt)
    result = []
    for c in centers.values():
        if any(w in c["name"] for w in EXCLUDE_WORDS):
            continue
        months = sorted(c["monthly"])
        c["lastMonth"] = months[-1] if months else None
        recent = [c["monthly"][m] for m in months[-12:]]
        c["recentAvg"] = round(sum(recent) / len(recent)) if recent else 0
        # 달(1~12월)별 평균 측정건수 → 어느 달이 붐비는지
        by_month = defaultdict(list)
        for m in months:
            by_month[int(m[4:6])].append(c["monthly"][m])
        c["seasonality"] = {str(k): round(sum(v) / len(v)) for k, v in sorted(by_month.items())}
        c["region"] = region_of(c["name"], c["address"])
        c["active"] = bool(c["lastMonth"] and c["lastMonth"] >= ACTIVE_SINCE)
        if not c["active"]:
            continue
        if c["region"] is None:
            print(f"  [확인 필요] 지역을 알 수 없는 센터: {c['name']} / {c['address']!r}")
        del c["monthly"]  # 화면에는 월별 평균(seasonality)만 쓴다
        result.append(c)
    return sorted(result, key=lambda c: c["name"])


def main():
    key = load_key()
    video_rows = fetch_all(key, VIDEO_API, "videos_raw")
    center_rows = fetch_all(key, CENTER_API, "centers_raw")

    videos = build_videos(video_rows)
    centers = build_centers(center_rows)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "videos.json").write_text(json.dumps(videos, ensure_ascii=False, indent=0), encoding="utf-8")
    (DATA_DIR / "centers.json").write_text(json.dumps(centers, ensure_ascii=False, indent=0), encoding="utf-8")

    from collections import Counter
    print(f"동영상 {len(videos)}개 (원본 {len(video_rows):,}행)")
    print("  대상:", Counter(v["target"] for v in videos))
    print("  체력요인:", Counter(v["factor"] for v in videos))
    print(f"센터 {len(centers)}곳 (원본 {len(center_rows):,}행)")
    print("  지역별:", Counter(c["region"] for c in centers))
    for c in centers[:3]:
        print("  예:", c["name"], c["region"], c["address"][:30], c["recentAvg"], c["seasonality"])


if __name__ == "__main__":
    main()
