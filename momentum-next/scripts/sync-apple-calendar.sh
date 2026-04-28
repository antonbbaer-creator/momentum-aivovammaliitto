#!/usr/bin/env bash
# Lukee Apple Calendarin tapahtumat ja kopioi ne leikepöydälle Momentumin
# tuontidialogille (events + categories per kalenteri värein).
#
# Käyttö:
#   scripts/sync-apple-calendar.sh                  # tämä viikko (ma–su)
#   scripts/sync-apple-calendar.sh --week 1         # ensi viikko
#   scripts/sync-apple-calendar.sh --week -1        # edellinen viikko
#   scripts/sync-apple-calendar.sh --days 14        # seuraavat 14 päivää
#
# Avaa sen jälkeen Momentumissa /oma/viikko ja paina "Tuo Apple-kalenterista"
# → "Liitä leikepöydältä" → "Tuo N tapahtumaa".

set -euo pipefail

SPAN_DAYS=7
WEEK_OFFSET=0
MODE="week"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --week)   WEEK_OFFSET="${2:-0}"; MODE="week"; shift 2 ;;
    --days)   SPAN_DAYS="${2:-7}"; MODE="days"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Tuntematon argumentti: $1" >&2; exit 2 ;;
  esac
done

RAW_OUT="$(mktemp -t momentum-cal.XXXXXX)"
APPLESCRIPT="$(mktemp -t momentum-cal.XXXXXX).applescript"
trap 'rm -f "$RAW_OUT" "$APPLESCRIPT"' EXIT

cat > "$APPLESCRIPT" <<'AS'
on iso(d)
  set y to year of d as string
  set mo to (month of d as integer) as string
  if (count of mo) = 1 then set mo to "0" & mo
  set da to (day of d) as string
  if (count of da) = 1 then set da to "0" & da
  set h to (hours of d) as string
  if (count of h) = 1 then set h to "0" & h
  set mi to (minutes of d) as string
  if (count of mi) = 1 then set mi to "0" & mi
  return y & "-" & mo & "-" & da & "T" & h & ":" & mi
end iso

on run argv
  set spanDays to (item 1 of argv) as integer
  set offsetWeeks to (item 2 of argv) as integer
  set modeStr to (item 3 of argv) as string

  tell application "Calendar"
    set startDate to current date
    set hours of startDate to 0
    set minutes of startDate to 0
    set seconds of startDate to 0
    if modeStr is "week" then
      set wd to weekday of startDate as integer
      if wd = 1 then
        set startDate to startDate - (6 * days)
      else
        set startDate to startDate - ((wd - 2) * days)
      end if
      set startDate to startDate + (offsetWeeks * 7 * days)
      set endDate to startDate + (7 * days)
    else
      set endDate to startDate + (spanDays * days)
    end if

    set output to ""
    repeat with cal in (every calendar)
      try
        repeat with e in (every event of cal whose start date >= startDate and start date < endDate)
          set s to summary of e
          if s is missing value then set s to "(nimetön)"
          try
            set loc to location of e
            if loc is missing value then set loc to ""
          on error
            set loc to ""
          end try
          set output to output & (name of cal) & "\t" & s & "\t" & my iso(start date of e) & "\t" & my iso(end date of e) & "\t" & loc & linefeed
        end repeat
      end try
    end repeat
    return output
  end tell
end run
AS

# Aja AppleScript ja vie raakaresponssi tiedostoon. UTF-8 säilyy.
osascript "$APPLESCRIPT" "$SPAN_DAYS" "$WEEK_OFFSET" "$MODE" > "$RAW_OUT"

# Pythonin pitää lukea tiedosto UTF-8:na (osascriptin output on UTF-8).
JSON="$(LC_ALL=en_US.UTF-8 python3 - "$RAW_OUT" <<'PY'
import sys, json, re, hashlib
path = sys.argv[1]
iso_re = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")

# Värivalikoima — Hetki-paletista lähteviä, deterministinen järjestys
PALETTE = [
    "#056b9f",  # Hetki blue
    "#e45c81",  # Hetki pink
    "#185e5b",  # Hetki green
    "#f1b434",  # Hetki yellow
    "#9b7cf6",  # violetti
    "#f09a52",  # oranssi
    "#3788b2",  # vaalea sininen
    "#2a8a86",  # turkoosi
    "#c14545",  # punainen
    "#7a5fb0",  # tumma violetti
    "#cc7a35",  # tumma oranssi
    "#5b9b3f",  # ruohon vihreä
]

def cat_id_for(name: str) -> str:
    h = hashlib.sha1(name.encode("utf-8")).hexdigest()[:8]
    return f"apple-cal-{h}"

with open(path, "r", encoding="utf-8") as f:
    raw = f.read()

# Yhdistä rivit joissa lokaatio sisältää rivinvaihdon
joined = []
for ln in raw.split("\n"):
    if not ln.strip():
        continue
    parts = ln.split("\t")
    if len(parts) >= 4 and iso_re.match(parts[2]):
        joined.append(parts)
    elif joined:
        prev = joined[-1]
        prev[-1] = (prev[-1] + " " + parts[0]).strip()
        for p in parts[1:]:
            prev.append(p)

events = []
calendars_seen = []
for parts in joined:
    while len(parts) < 5:
        parts.append("")
    cal = parts[0].strip()
    title = parts[1].strip()
    start = parts[2].strip()
    end = parts[3].strip()
    loc = parts[4].strip()
    if not iso_re.match(start):
        continue
    if cal and cal not in calendars_seen:
        calendars_seen.append(cal)
    h = hashlib.sha1(f"{cal}|{title}|{start}".encode("utf-8")).hexdigest()[:10]
    full_title = title
    if loc:
        loc_clean = re.sub(r"\s+", " ", loc).strip().rstrip(",")
        full_title = f"{title} ({loc_clean})"
    events.append({
        "id": f"apple-{h}",
        "title": full_title,
        "start": start,
        "end": end,
        "recurrence": "none",
        "externalSource": "apple",
        "externalCalendarId": cal,
        "externalEventId": f"{cal}::{title}::{start}",
        "categoryId": cat_id_for(cal),
    })

categories = []
for i, cal in enumerate(calendars_seen):
    categories.append({
        "id": cat_id_for(cal),
        "name": cal,
        "color": PALETTE[i % len(PALETTE)],
    })

print(json.dumps({"events": events, "categories": categories}, ensure_ascii=False))
PY
)"

COUNT_E=$(printf '%s' "$JSON" | LC_ALL=en_US.UTF-8 python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['events']))")
COUNT_C=$(printf '%s' "$JSON" | LC_ALL=en_US.UTF-8 python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['categories']))")

printf '%s' "$JSON" | pbcopy

echo "[sync-apple-calendar] $COUNT_E tapahtumaa, $COUNT_C elämänaluetta kopioitu leikepöydälle." >&2
echo "[sync-apple-calendar] Avaa Momentum → /oma/viikko → 'Tuo Apple-kalenterista' → 'Liitä leikepöydältä' → Tuo." >&2
