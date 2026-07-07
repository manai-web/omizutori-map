// 全国お水取りマップ 地理計算モジュール
const Geo = (() => {
  const R = 6371.0088; // 地球平均半径 km
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const norm360 = a => ((a % 360) + 360) % 360;

  // 大圏距離 (km)
  function distanceKm(lat1, lng1, lat2, lng2) {
    const p1 = rad(lat1), p2 = rad(lat2);
    const dp = rad(lat2 - lat1), dl = rad(lng2 - lng1);
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // 大圏コースの初期方位角 (真北基準, 0-360°)
  function bearingTrue(lat1, lng1, lat2, lng2) {
    const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lng2 - lng1);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm360(deg(Math.atan2(y, x)));
  }

  // 基点から方位角・距離だけ進んだ地点 (球面近似)
  function destination(lat, lng, bearingDeg, distKm) {
    const p1 = rad(lat), l1 = rad(lng), br = rad(bearingDeg), dr = distKm / R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(br));
    const l2 = l1 + Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(p1),
      Math.cos(dr) - Math.sin(p1) * Math.sin(p2)
    );
    return [deg(p2), deg(l2)];
  }

  // 磁気偏角 (国土地理院 磁気図2020.0年値の近似式)
  // D = 8°15.822' + 18.462'Δφ − 7.726'Δλ + 0.007'Δφ² − 0.007'ΔφΔλ − 0.655'Δλ²
  // Δφ = 緯度 − 37°, Δλ = 経度 − 138°。西偏を正(度)で返す。
  function declination(lat, lng) {
    const dp = lat - 37, dl = lng - 138;
    const minutes = 495.822 + 18.462 * dp - 7.726 * dl
      + 0.007 * dp * dp - 0.007 * dp * dl - 0.655 * dl * dl;
    return minutes / 60;
  }

  // 真北基準の方位角 → 表示用方位角 (磁北モードなら磁北基準に変換)
  // 磁北は真北より D° 西にあるため、磁北基準の方位角 = 真北基準 + D
  function displayBearing(trueBearing, northMode, decl) {
    return northMode === "mag" ? norm360(trueBearing + decl) : norm360(trueBearing);
  }

  // 方位区分の境界 (北基準の方位角, 北扇の開始角から時計回り)
  // 気学式: 四正(北東南西)30°・四隅60° / 均等: 各45°
  const SECTORS_KIGAKU = [
    { name: "北", from: 345, to: 15 },
    { name: "北東", from: 15, to: 75 },
    { name: "東", from: 75, to: 105 },
    { name: "南東", from: 105, to: 165 },
    { name: "南", from: 165, to: 195 },
    { name: "南西", from: 195, to: 255 },
    { name: "西", from: 255, to: 285 },
    { name: "北西", from: 285, to: 345 }
  ];
  const SECTORS_EQUAL = [
    { name: "北", from: 337.5, to: 22.5 },
    { name: "北東", from: 22.5, to: 67.5 },
    { name: "東", from: 67.5, to: 112.5 },
    { name: "南東", from: 112.5, to: 157.5 },
    { name: "南", from: 157.5, to: 202.5 },
    { name: "南西", from: 202.5, to: 247.5 },
    { name: "西", from: 247.5, to: 292.5 },
    { name: "北西", from: 292.5, to: 337.5 }
  ];
  const ETO = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  function sectors(mode) {
    return mode === "equal" ? SECTORS_EQUAL : SECTORS_KIGAKU;
  }

  // 方位角(北基準調整済み) → 8方位名
  function directionName(b, mode) {
    b = norm360(b);
    for (const s of sectors(mode)) {
      if (s.from > s.to) { // 北をまたぐ扇
        if (b >= s.from || b < s.to) return s.name;
      } else if (b >= s.from && b < s.to) {
        return s.name;
      }
    }
    return "北";
  }

  // 方位角 → 十二支 (各30°、子=北)
  function etoName(b) {
    return ETO[Math.floor(norm360(b + 15) / 30) % 12];
  }

  return { distanceKm, bearingTrue, destination, declination, displayBearing, sectors, directionName, etoName, norm360 };
})();
