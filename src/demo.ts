import {
  addDays,
  addReservation,
  assign,
  emptyState,
  today,
  uid,
  type Kind,
  type State,
} from "./domain";

// 체험 전용 예시. 현장의 실제 자리 수·배치·장박을 의미하지 않는다.
export function demoState(day = today()): State {
  const s = emptyState();
  s.demo = true;
  const groups: [string, number, Kind][] = [
    ["가", 10, "auto"],
    ["나", 16, "auto"],
    ["다", 12, "auto"],
    ["라", 8, "glamping"],
    ["마", 8, "auto"],
    ["B", 6, "caravan"],
  ];
  groups.forEach(([area, count, kind]) => {
    for (let i = 1; i <= count; i++)
      s.sites.push({
        id: `demo-${area}-${i}`,
        label: kind === "caravan" ? `카라반 ${i + 2}` : `${area}${i}`,
        area,
        kind,
        archived: false,
      });
  });
  const names = [
    "김민준",
    "이서연",
    "박지호",
    "최유진",
    "정수빈",
    "강현우",
    "윤지민",
    "한도윤",
    "서하준",
    "장예린",
    "오시우",
    "신하린",
    "임태호",
    "배수아",
    "김도현",
    "이지안",
    "박서준",
    "정다은",
  ];
  names.forEach((name, i) => {
    const r = addReservation(
      s,
      {
        name,
        phone: `010-0000-${String(1000 + i)}`,
        arrival: i < 9 ? addDays(day, -1) : day,
        departure: addDays(day, (i % 3) + 1),
        kind: i === 12 ? "caravan" : i === 7 || i === 13 ? "glamping" : "auto",
        source: ["캠핏", "네이버", "전화"][i % 3],
        people: (i % 3) + 2,
        vehicle: i < 9 ? `12가 ${1000 + i}` : "",
        note:
          i === 9
            ? "두 가족이 함께 방문해요. 가까운 자리 희망"
            : i === 10
              ? "아이 2명 동반"
              : "",
        fee: i === 2 ? 10000 : 0,
        paid: false,
      },
      `DEMO-${i + 1}`,
    );
    if (i < 9) {
      const siteId =
        i === 7 ? "demo-라-2" : i < 5 ? `demo-가-${i + 2}` : `demo-나-${i}`;
      assign(s, r.id, siteId, true, `${addDays(day, -1)}T15:00:00`);
    }
    if (i === 12) assign(s, r.id, "demo-B-3", false);
  });
  for (const [siteId, name] of [
    ["demo-나-2", "김영수"],
    ["demo-나-3", "박정희"],
    ["demo-다-9", "이상호"],
    ["demo-마-5", "최미경"],
  ])
    s.blocks.push({
      id: uid(),
      siteId,
      name,
      phone: "010-0000-0000",
      type: "long",
      start: `${addDays(day, -10)}T14:00:00`,
      end: `${addDays(day, 30)}T11:00:00`,
      note: "체험용 장박 예시",
    });
  s.blocks.push({
    id: uid(),
    siteId: "demo-다-1",
    type: "disabled",
    name: "시설 정비",
    phone: "",
    start: `${day}T00:00:00`,
    end: `${addDays(day, 3)}T11:00:00`,
    note: "체험용 사용중지 예시",
  });
  s.activity = [];
  return s;
}
