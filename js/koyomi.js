// 全国お水取りマップ 暦計算モジュール
// 節気は太陽視黄経の天文計算(精度±数分)で求めるため、係数表の例外年問題がない。
// 日の干支アンカー: 甲子 = (JDN + 49) % 60 == 0
//   (参考アプリの 2026-07-03=寅日(日破申)・2027-10-11=亥日(日破巳) と一致することを確認済み)
const Koyomi = (() => {
  const KANJI = ["", "一白水星", "二黒土星", "三碧木星", "四緑木星", "五黄土星", "六白金星", "七赤金星", "八白土星", "九紫火星"];
  const ETO = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  // グレゴリオ暦 → ユリウス通日(正午基準の整数)
  function jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
      - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  // 太陽視黄経(度) jd: ユリウス日(連続値, UT≒TT扱い)
  function sunLongitude(jd) {
    const T = (jd - 2451545.0) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI / 180;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
      + 0.000289 * Math.sin(3 * M);
    const omega = (125.04 - 1934.136 * T) * Math.PI / 180;
    let lon = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
    return ((lon % 360) + 360) % 360;
  }

  // ある日(JST)の終わり(翌日0時JST)のユリウス日
  function jdAtEndOfDayJST(j) { return j + 1 - 0.875; }

  // 太陽黄経がtargetになる瞬間のJST日付(JDN)を返す
  function solarTermJdn(year, month, day, targetLon) {
    let jd = jdn(year, month, day) - 0.375; // 正午JSTあたりから反復
    for (let i = 0; i < 5; i++) {
      const diff = ((targetLon - sunLongitude(jd) + 540) % 360) - 180;
      jd += diff / 0.9856;
    }
    return Math.floor(jd + 0.875); // JSTの暦日
  }

  // 節月(寅=1 … 丑=12)。節入り日はその日から新しい月として扱う。
  function monthIndex(j) {
    const lon = sunLongitude(jdAtEndOfDayJST(j));
    return Math.floor((((lon - 315) % 360) + 360) % 360 / 30) + 1;
  }

  // 九星の年(立春替わり)
  function kigakuYear(y, calMonth, mIdx) {
    return (calMonth <= 2 && mIdx >= 11) ? y - 1 : y;
  }

  function yearStar(ky) {
    let s = 11 - (ky % 9);
    if (s > 9) s -= 9;
    return s;
  }

  // 月の九星: 年星グループごとに寅月の星から月ごとに1つずつ下がる
  function monthStar(yStar, mIdx) {
    const start = { 1: 8, 2: 2, 0: 5 }[yStar % 3]; // {1,4,7}→八白, {2,5,8}→二黒, {3,6,9}→五黄
    return ((start - mIdx) % 9 + 9) % 9 + 1;
  }

  // 日の干支番号(甲子=0)
  function dayCycle(j) { return (j + 49) % 60; }

  // 冬至・夏至に最も近い甲子日 → 陽遁・陰遁の切替日
  function nearestKoshi(j) {
    const k = dayCycle(j);
    return k <= 30 ? j - k : j + (60 - k);
  }

  function tonSwitchList(y) {
    // 対象日の前後をカバーする切替点(冬至→陽遁, 夏至→陰遁)
    const list = [];
    for (const yy of [y - 1, y, y + 1]) {
      list.push({ j: nearestKoshi(solarTermJdn(yy, 12, 22, 270)), mode: "yo" });
      list.push({ j: nearestKoshi(solarTermJdn(yy, 6, 21, 90)), mode: "in" });
    }
    return list.sort((a, b) => a.j - b.j);
  }

  function dayStar(j, y) {
    const sw = tonSwitchList(y);
    let cur = sw[0];
    for (const s of sw) { if (s.j <= j) cur = s; }
    const off = (j - cur.j) % 9;
    return cur.mode === "yo" ? off + 1 : 9 - off;
  }

  // 指定日(暦日)の気学情報一式
  function info(y, m, d) {
    const j = jdn(y, m, d);
    const mIdx = monthIndex(j);
    const ky = kigakuYear(y, m, mIdx);
    const yStar = yearStar(ky);
    return {
      jdn: j,
      kigakuYear: ky,
      yearStar: yStar,
      monthIndex: mIdx,                    // 寅=1 … 丑=12
      monthStar: monthStar(yStar, mIdx),
      dayStar: dayStar(j, y),
      yearEto: ((ky - 4) % 12 + 12) % 12,  // 子=0
      monthEto: (mIdx + 1) % 12,
      dayEto: dayCycle(j) % 12,
      tonMode: null // 参考用(必要になれば公開)
    };
  }

  // 本命星・月命星(生年月日から)
  function meiStars(y, m, d) {
    const i = info(y, m, d);
    return { honmei: i.yearStar, getsumei: i.monthStar };
  }

  return { jdn, info, meiStars, sunLongitude, solarTermJdn, KANJI, ETO };
})();
if (typeof module !== "undefined") module.exports = Koyomi;
