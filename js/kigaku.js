// 全国お水取りマップ 九星気学 吉凶判定モジュール
// 教本「本命・月命一覧表」(最大吉方)・「月命の切り替え」ルール、
// 参考アプリの盤表示(2026/7/3・2027/10/11ほか7日付)と一致することを検証済み。
const Kigaku = (() => {
  const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const OPP = { 北: "南", 北東: "南西", 東: "西", 南東: "北西", 南: "北", 南西: "北東", 西: "東", 北西: "南東" };
  const TEII = { 北: 1, 北東: 8, 東: 3, 南東: 4, 南: 9, 南西: 2, 西: 7, 北西: 6 }; // 後天定位
  const KANSUJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  // 五行と相生相剋
  const GOGYO = { 1: "水", 2: "土", 3: "木", 4: "木", 5: "土", 6: "金", 7: "金", 8: "土", 9: "火" };
  const SHENG = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" }; // AはBを生む
  const KE = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };    // AはBを剋す

  // self(自分の星)から見たotherの関係
  function relation(self, other) {
    const s = GOGYO[self], o = GOGYO[other];
    if (s === o) return "比和";
    if (SHENG[o] === s) return "生気";
    if (SHENG[s] === o) return "退気";
    if (KE[o] === s) return "殺気";
    if (KE[s] === o) return "死気";
    return "";
  }
  const GOOD = new Set(["生気", "比和", "退気"]);

  // 月命の切り替え(本命星=月命星のとき、教本p17)
  const SWAP = { 1: 9, 2: 6, 3: 4, 4: 3, 6: 2, 7: 8, 8: 7, 9: 1 };
  function effectiveGetsumei(honmei, getsumei, gender) {
    if (honmei !== getsumei) return getsumei;
    if (honmei === 5) return gender === "male" ? 7 : 6; // 五黄同士のみ性別で分岐
    return SWAP[honmei];
  }

  // 中宮星→8方位の回座星
  function ban(chuu) {
    const out = {};
    for (const d of DIRS) out[d] = ((TEII[d] + chuu - 5 - 1) % 9 + 9) % 9 + 1;
    return out;
  }

  // 十二支(子=0)→宮
  const ETO_DIR = ["北", "北東", "北東", "東", "南東", "南東", "南", "南西", "南西", "西", "北西", "北西"];

  // 天道(月支ごと、三合の法則: 生月→旺, 旺月→墓, 墓月→旺)
  // 実測(参考アプリ): 午月=北西・戌月=南 と一致
  const TENDO = { 2: "南", 3: "南西", 4: "北", 5: "西", 6: "北西", 7: "東", 8: "北", 9: "北東", 10: "南", 11: "東", 0: "南東", 1: "西" };

  const HA_NAME = { year: "歳破", month: "月破", day: "日破" };

  /**
   * 1つの盤の全方位を判定する
   * @param chuu 中宮星
   * @param kind "year"|"month"|"day"
   * @param koyomi Koyomi.info() の結果
   * @param person {honmei, getsumei, gender}
   * @returns {chuu, dirs:{方位:{star, labels[], status, tendo}}}
   */
  function judge(chuu, kind, koyomi, person) {
    const stars = ban(chuu);
    const honmei = person.honmei;
    const getsumei = person.getsumei;
    const getsumeiEff = effectiveGetsumei(honmei, getsumei, person.gender);

    // 破(盤の種類に応じた支の冲)
    const shi = { year: koyomi.yearEto, month: koyomi.monthEto, day: koyomi.dayEto }[kind];
    const haShi = (shi + 6) % 12;
    const haDir = ETO_DIR[haShi];
    const tendoDir = TENDO[koyomi.monthEto];

    const dirs = {};
    for (const d of DIRS) {
      const star = stars[d];
      const labels = [];

      if (star === 5) labels.push("五黄殺");
      if (chuu !== 5 && stars[OPP[d]] === 5) labels.push("暗剣殺");
      if (star === honmei) labels.push("本命殺");
      if (stars[OPP[d]] === honmei) labels.push("本命的殺");
      if (getsumei !== honmei) {
        if (star === getsumei) labels.push("月命殺");
        if (stars[OPP[d]] === getsumei) labels.push("月命的殺");
      }
      if (star !== 5 && TEII[OPP[d]] === star) labels.push("定位対冲");
      if (d === haDir) labels.push(`${HA_NAME[kind]}(${Koyomi.ETO[haShi]})`);

      const rel = relation(honmei, star);
      const isKyoLabel = labels.length > 0;
      const relBad = rel === "死気" || rel === "殺気";

      let status;
      if (isKyoLabel || relBad) {
        status = "kyo";
        if (relBad) labels.push(rel);
      } else if (GOOD.has(rel)) {
        const relGetsu = relation(getsumeiEff, star);
        status = (GOOD.has(relGetsu) && star !== getsumeiEff) ? "max" : "kichi";
        labels.push(rel);
        if (status === "max") labels.push("最大吉方");
      } else {
        status = "neutral";
      }

      dirs[d] = { star, labels, status, tendo: d === tendoDir };
    }
    return { chuu, kind, dirs, tendoDir, haDir, haShi };
  }

  // 3盤まとめて
  function judgeAll(koyomi, person) {
    return {
      year: judge(koyomi.yearStar, "year", koyomi, person),
      month: judge(koyomi.monthStar, "month", koyomi, person),
      day: judge(koyomi.dayStar, "day", koyomi, person)
    };
  }

  // 教本の吉方解説(ヘルプ表示用)
  const KICHI_SETSUMEI = {
    "生気": "本命星の親星が廻座する方位。権威ある人からの支援など、大きな力が働いて運勢を好転させる。",
    "退気": "本命星の子星が廻座する方位。奉仕・多忙を通じて方徳が顕現する。二番手でいることで大きな吉となる。",
    "比和": "本命星の兄弟星が廻座する方位。同僚・友人・隣人と和した後に大きな支援・助力を受ける。"
  };

  return { DIRS, OPP, TEII, KANSUJI, ban, relation, effectiveGetsumei, judge, judgeAll, TENDO, ETO_DIR, KICHI_SETSUMEI };
})();
if (typeof module !== "undefined") module.exports = Kigaku;
