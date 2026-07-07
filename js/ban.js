// 全国お水取りマップ 命盤SVG描画モジュール
const BanUI = (() => {
  const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const ANG = { 北: 0, 北東: 45, 東: 90, 南東: 135, 南: 180, 南西: 225, 西: 270, 北西: 315 };
  const KANSUJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const HOSHI = ["", "一白水星", "二黒土星", "三碧木星", "四緑木星", "五黄土星", "六白金星", "七赤金星", "八白土星", "九紫火星"];
  const ETO = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const FILL = { max: "#c9a227", kichi: "#ecdfae", kyo: "#d9d5cb", neutral: "#fdfbf3" };
  const TXT = { max: "#fffdf6", kichi: "#6b5a1e", kyo: "#6f6a5e", neutral: "#3a3226" };

  function pt(r, ang) {
    const a = (ang - 90) * Math.PI / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  const poly = pts => pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
  const octagon = r => poly(DIRS.map(d => pt(r, ANG[d] - 22.5)));

  // ミニ盤(下部バー用)
  function mini(judged, needle) {
    if (!judged) return "<svg viewBox='-62 -66 124 132'></svg>";
    let s = "";
    for (const d of DIRS) {
      const c = judged.dirs[d];
      const a1 = ANG[d] - 22.5, a2 = ANG[d] + 22.5;
      s += `<polygon points="${poly([pt(20, a1), pt(52, a1), pt(52, a2), pt(20, a2)])}" fill="${FILL[c.status]}" stroke="#8a7a4a" stroke-width="0.8"/>`;
      const [tx, ty] = pt(37, ANG[d]);
      s += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="13" text-anchor="middle" dominant-baseline="central" fill="${TXT[c.status]}" font-weight="600">${KANSUJI[c.star]}</text>`;
    }
    s += `<polygon points="${octagon(20)}" fill="#8f2b3c" stroke="#8a7a4a" stroke-width="0.8"/>`;
    s += `<text x="0" y="0" font-size="15" text-anchor="middle" dominant-baseline="central" fill="#fffdf6" font-weight="700">${KANSUJI[judged.chuu]}</text>`;
    s += `<text x="0" y="-58" font-size="9" text-anchor="middle" fill="#3a3226">北</text>`;
    if (needle != null) {
      const [nx, ny] = pt(50, needle);
      s += `<line x1="0" y1="0" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#c0392b" stroke-width="1.5" opacity="0.85"/>`;
    }
    return `<svg viewBox="-62 -66 124 132" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  // 詳細盤(モーダル用)
  function detail(judged, needle) {
    if (!judged) return "<svg viewBox='-172 -172 344 344'></svg>";
    const R1 = 30, RD = 50, RE = 70, RS = 112;
    let s = "";

    // 方位セル(全リング分を塗る)
    for (const d of DIRS) {
      const c = judged.dirs[d];
      const a1 = ANG[d] - 22.5, a2 = ANG[d] + 22.5;
      s += `<polygon points="${poly([pt(R1, a1), pt(RS, a1), pt(RS, a2), pt(R1, a2)])}" fill="${FILL[c.status]}" stroke="#8a7a4a" stroke-width="1"/>`;
    }
    // リング境界
    s += `<polygon points="${octagon(RD)}" fill="none" stroke="#8a7a4a" stroke-width="0.7"/>`;
    s += `<polygon points="${octagon(RE)}" fill="none" stroke="#8a7a4a" stroke-width="0.7"/>`;
    // 十二支の仕切り(30°ごと、支リング内のみ)
    for (let k = 0; k < 12; k++) {
      const a = 15 + k * 30;
      const [x1, y1] = pt(RD, a), [x2, y2] = pt(RE, a);
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8a7a4a" stroke-width="0.5"/>`;
    }

    for (const d of DIRS) {
      const c = judged.dirs[d];
      // 方位名
      const [dx, dy] = pt(40, ANG[d]);
      s += `<text x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" font-size="11" text-anchor="middle" dominant-baseline="central" fill="#3a3226">${d}</text>`;
      // 星(漢数字)
      const [sx, sy] = pt(91, ANG[d]);
      s += `<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-size="20" text-anchor="middle" dominant-baseline="central" fill="${TXT[c.status]}" font-weight="700">${KANSUJI[c.star]}</text>`;
    }
    // 十二支
    for (let k = 0; k < 12; k++) {
      const [ex, ey] = pt(60, k * 30);
      s += `<text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" font-size="11" text-anchor="middle" dominant-baseline="central" fill="#3a3226">${ETO[k]}</text>`;
    }
    // 中央
    s += `<polygon points="${octagon(R1)}" fill="#8f2b3c" stroke="#8a7a4a" stroke-width="1"/>`;
    s += `<text x="0" y="0" font-size="11" text-anchor="middle" dominant-baseline="central" fill="#fffdf6" font-weight="700">${HOSHI[judged.chuu]}</text>`;

    // 外側ラベル(凶殺・吉方名・天道)
    for (const d of DIRS) {
      const c = judged.dirs[d];
      const lines = [...c.labels];
      if (c.tendo) lines.unshift("天道");
      if (!lines.length) continue;
      const ang = ANG[d];
      let anchor = "middle";
      if (ang > 20 && ang < 160) anchor = "start";
      else if (ang > 200 && ang < 340) anchor = "end";
      const [bx, by] = pt(122, ang);
      const up = (ang === 0);
      lines.forEach((t, i) => {
        const yy = by + (up ? -(lines.length - 1 - i) * 12 : i * 12) - (ang === 180 ? -4 : 4);
        const isTendo = t === "天道";
        const isKichi = t === "生気" || t === "退気" || t === "比和" || t === "最大吉方";
        const col = isTendo ? "#fffdf6" : (isKichi ? "#a07d17" : "#5a544a");
        if (isTendo) {
          s += `<rect x="${(bx + (anchor === "end" ? -30 : anchor === "middle" ? -15 : 0)).toFixed(1)}" y="${(yy - 9).toFixed(1)}" width="30" height="12" rx="3" fill="#c9a227"/>`;
        }
        s += `<text x="${(bx + (anchor === "middle" && isTendo ? 0 : isTendo ? (anchor === "end" ? -15 : 15) : 0)).toFixed(1)}" y="${yy.toFixed(1)}" font-size="10" text-anchor="${isTendo ? "middle" : anchor}" fill="${col}" font-weight="600">${t}</text>`;
      });
    }
    // 北マーク・針
    s += `<text x="0" y="-160" font-size="11" text-anchor="middle" fill="#3a3226">北</text>`;
    if (needle != null) {
      const [nx, ny] = pt(110, needle);
      s += `<line x1="0" y1="0" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#c0392b" stroke-width="1.6" opacity="0.85"/>`;
    }
    return `<svg viewBox="-172 -178 344 356" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  return { mini, detail, KANSUJI, HOSHI };
})();
if (typeof module !== "undefined") module.exports = BanUI;
