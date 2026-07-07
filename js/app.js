// 全国お水取りマップ メイン (Phase 2: 九星気学対応)
(() => {
  "use strict";

  // ---------- 状態 ----------
  const STORAGE_KEY = "omizu.v3";
  function todayISO() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  const state = Object.assign({
    home: null,             // {name, lat, lng}
    sectorMode: "kigaku",
    northMode: "mag",
    date: todayISO(),
    pins: [],               // ユーザーが置いたピン {id, name, lat, lng}
    premiumCode: "",        // 月替わりの合言葉(当月分と一致すれば有料機能が解錠)
    people: [{ id: "p1", name: "え", birth: "1984-03-03", gender: "" }],
    activePersonId: "p1",
    banFocus: "day",        // 地図の色分けに使う盤
    banCollapsed: false
  }, loadState());
  state.date = todayISO(); // 起動時は常に今日から

  function loadState() {
    try {
      const v3 = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (v3) return v3;
      const v2 = JSON.parse(localStorage.getItem("omizu.v2"));
      if (v2) return { home: v2.home || null, sectorMode: v2.sectorMode, northMode: v2.northMode };
      const v1 = JSON.parse(localStorage.getItem("omizu.v1"));
      if (v1) {
        const b = (v1.bases || []).find(x => x.id === v1.activeBaseId) || (v1.bases || [])[0];
        return { home: b ? { name: "自宅", lat: b.lat, lng: b.lng } : null, sectorMode: v1.sectorMode, northMode: v1.northMode };
      }
    } catch { /* 破損時は初期状態 */ }
    return {};
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  const escapeHtml = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const KIND_NAME = { year: "年盤", month: "月盤", day: "日盤" };

  // ---------- プレミアム(月額880円) ----------
  const PREMIUM_URL = ""; // 販売ページ(ブログ)のURL。決まったらここに設定

  // 会員コード(一度入力すればずっと有効)。
  // お知らせシートに「コード」行があればそちらが優先される(アプリ再公開なしで差し替え可能)。
  // 解約者を締め出したくなったらシートのコードを新しくして、購読者に新コードを配信する。
  const VALID_CODES = ["MIZUHIBIKI"];
  let sheetCodes = null; // お知らせから読み込んだ有効コード
  function validCodes() {
    return sheetCodes || state.cachedCodes || VALID_CODES;
  }
  function isPremium() {
    return validCodes().includes((state.premiumCode || "").trim().toUpperCase());
  }

  // ---------- お知らせ ----------
  // 運用時はGoogleスプレッドシート(ファイル>共有>ウェブに公開>CSV)のURLに差し替える。
  // シートの列: 日付, 種別(全員/会員/コード), タイトル, 本文
  const ANNOUNCE_URL = "announce.csv";
  let announceRows = null;

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  async function loadAnnounce() {
    try {
      const res = await fetch(ANNOUNCE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const rows = parseCsv(await res.text());
      const list = [];
      const codes = [];
      for (const r of rows.slice(1)) {
        const [date, kind, title, body] = r.map(x => (x || "").trim());
        if (!kind) continue;
        if (kind === "コード") {
          for (const c of body.split(/[,、\s/]+/)) if (c) codes.push(c.toUpperCase());
        } else {
          list.push({ date, kind, title, body });
        }
      }
      announceRows = list.reverse(); // 新しいものを上に
      if (codes.length) { sheetCodes = codes; state.cachedCodes = codes; }
      refresh(); // コード差し替えで解錠状態が変わる可能性があるため全体更新
    } catch { /* 取得失敗時はキャッシュ(cachedCodes)と埋め込みコードで動作 */ }
  }

  function renderAnnounce() {
    const el = document.getElementById("announceBox");
    if (!announceRows || !announceRows.length) {
      el.innerHTML = `<p class="note">現在お知らせはありません。</p>`;
      return;
    }
    const prem = isPremium();
    const items = announceRows.filter(a => a.kind !== "会員" || prem).slice(0, 10);
    if (!items.length) { el.innerHTML = `<p class="note">現在お知らせはありません。</p>`; return; }
    el.innerHTML = items.map(a => `
      <div class="announce-item${a.kind === "会員" ? " announce-member" : ""}">
        <div class="announce-head">${a.kind === "会員" ? "✨会員 " : ""}${escapeHtml(a.title)} <small>${escapeHtml(a.date)}</small></div>
        <div class="announce-body">${escapeHtml(a.body)}</div>
      </div>`).join("");
  }

  // ---------- 気学計算(日付・人物が変わるたびに更新) ----------
  let current = { koyomi: null, mei: null, judged: null };

  function activePerson() {
    return state.people.find(p => p.id === state.activePersonId) || state.people[0] || null;
  }
  function recalc() {
    const [y, m, d] = state.date.split("-").map(Number);
    current.koyomi = Koyomi.info(y, m, d);
    const p = activePerson();
    if (p) {
      const [by, bm, bd] = p.birth.split("-").map(Number);
      const mei = Koyomi.meiStars(by, bm, bd);
      current.mei = { ...mei, gender: p.gender || "" };
      current.judged = Kigaku.judgeAll(current.koyomi, current.mei);
    } else {
      current.mei = null;
      current.judged = null;
    }
  }

  // ---------- 地図 ----------
  const map = L.map("map", { zoomControl: false }).setView([37.3, 137.0], 5);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const tiles = {
    "地理院 淡色": L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>', maxZoom: 18
    }),
    "地理院 標準": L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>', maxZoom: 18
    }),
    "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19
    })
  };
  tiles["地理院 淡色"].addTo(map);
  L.control.layers(tiles, null, { position: "topright" }).addTo(map);

  const sectorLayer = L.layerGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  const spotLayer = L.layerGroup().addTo(map);
  let homeMarker = null;

  // ---------- 方位描画 ----------
  const SECTOR_RADIUS_KM = 1500;
  const SECTOR_FILL = {
    max: { color: "#c9a227", opacity: 0.30 },
    kichi: { color: "#c9a227", opacity: 0.13 },
    kyo: { color: "#5a544a", opacity: 0.15 },
    neutral: { color: "#c9a227", opacity: 0.03 }
  };

  function toTrueFrame(angle, decl) {
    return state.northMode === "mag" ? Geo.norm360(angle - decl) : Geo.norm360(angle);
  }
  function geodesicPoints(home, bearing, maxKm, stepKm) {
    const pts = [[home.lat, home.lng]];
    for (let d = stepKm; d <= maxKm; d += stepKm) pts.push(Geo.destination(home.lat, home.lng, bearing, d));
    return pts;
  }

  // ある地点の方位(表示フレーム)→方位名・状態
  function spotDirection(lat, lng) {
    const home = state.home;
    if (!home) return null;
    const decl = Geo.declination(home.lat, home.lng);
    const dist = Geo.distanceKm(home.lat, home.lng, lat, lng);
    const bd = Geo.displayBearing(Geo.bearingTrue(home.lat, home.lng, lat, lng), state.northMode, decl);
    return { dist, bearing: bd, dir: Geo.directionName(bd, state.sectorMode), eto: Geo.etoName(bd) };
  }
  function dirStatus(dirName, kind) {
    if (!current.judged || !dirName) return null;
    return current.judged[kind].dirs[dirName];
  }

  function redrawSectors() {
    sectorLayer.clearLayers();
    const home = state.home;
    if (!home) { redrawLabels(); return; }
    const decl = Geo.declination(home.lat, home.lng);

    for (const s of Geo.sectors(state.sectorMode)) {
      const fromT = toTrueFrame(s.from, decl);
      const span = Geo.norm360(s.to - s.from) || 360;
      const st = dirStatus(s.name, state.banFocus);
      const fill = SECTOR_FILL[st ? st.status : "neutral"];

      const poly = [[home.lat, home.lng]];
      for (let a = 0; a <= span; a += 3) {
        poly.push(Geo.destination(home.lat, home.lng, Geo.norm360(fromT + a), SECTOR_RADIUS_KM));
      }
      L.polygon(poly, { stroke: false, fillColor: fill.color, fillOpacity: fill.opacity, interactive: false }).addTo(sectorLayer);
      L.polyline(geodesicPoints(home, fromT, SECTOR_RADIUS_KM, 50), {
        color: "#3a3226", weight: 1.2, opacity: 0.75, interactive: false
      }).addTo(sectorLayer);
    }

    L.circle([home.lat, home.lng], {
      radius: 750, color: "#666", weight: 1, fillColor: "#777", fillOpacity: 0.35, interactive: false
    }).addTo(sectorLayer);

    if (homeMarker) homeMarker.remove();
    homeMarker = L.marker([home.lat, home.lng], {
      icon: L.divIcon({ className: "home-pin", html: "⌂", iconSize: [26, 26], iconAnchor: [13, 24] }),
      title: home.name, zIndexOffset: 500
    }).addTo(map);
    homeMarker.bindTooltip(home.name, { direction: "top", offset: [0, -20] });

    redrawLabels();
  }

  function redrawLabels() {
    labelLayer.clearLayers();
    const home = state.home;
    if (!home) return;
    const decl = Geo.declination(home.lat, home.lng);
    const zoom = map.getZoom();
    const mPerPx = 40075016.686 * Math.cos(home.lat * Math.PI / 180) / Math.pow(2, zoom + 8);
    const px = Math.min(map.getSize().x, map.getSize().y) * 0.33;
    const distKm = Math.min(Math.max(mPerPx * px / 1000, 1.2), 900);

    for (const s of Geo.sectors(state.sectorMode)) {
      const span = Geo.norm360(s.to - s.from) || 360;
      const midT = toTrueFrame(Geo.norm360(s.from + span / 2), decl);
      const pos = Geo.destination(home.lat, home.lng, midT, distKm);
      L.marker(pos, {
        icon: L.divIcon({ className: "dir-label", html: s.name, iconSize: [40, 20], iconAnchor: [20, 10] }),
        interactive: false
      }).addTo(labelLayer);
    }
  }

  // ---------- スポット ----------
  function spotIconSvg() {
    return `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.4 1 13c0 8.5 12 20 12 20s12-11.5 12-20C25 6.4 19.6 1 13 1z"
            fill="#b8912f" stroke="#fffdf6" stroke-width="1.6"/>
      <path d="M13 7c-2.6 3.4-4.4 5.9-4.4 8.2A4.4 4.4 0 0 0 13 19.6a4.4 4.4 0 0 0 4.4-4.4C17.4 12.9 15.6 10.4 13 7z"
            fill="#fffdf6"/></svg>`;
  }
  function spotIcon(statusClass) {
    return L.divIcon({
      className: "spot-pin" + (statusClass ? " " + statusClass : ""),
      html: spotIconSvg(),
      iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30]
    });
  }

  function banSummaryHtml(lat, lng) {
    const pos = spotDirection(lat, lng);
    if (!pos || !current.judged) return "";
    const parts = [];
    for (const kind of ["year", "month", "day"]) {
      const st = current.judged[kind].dirs[pos.dir];
      let t;
      if (st.status === "max") t = "◎最大吉方";
      else if (st.status === "kichi") t = `○${st.labels.find(l => ["生気", "比和", "退気"].includes(l)) || "吉方"}`;
      else if (st.status === "kyo") t = `×${st.labels[0] || "凶"}`;
      else t = "−";
      const tendo = st.tendo && kind !== "year" ? "〈天道〉" : "";
      parts.push(`${KIND_NAME[kind]}: ${t}${tendo}`);
    }
    return `<div class="popup-ban">${parts.join("<br>")}</div>`;
  }

  function positionTextFor(lat, lng) {
    const pos = spotDirection(lat, lng);
    if (!pos) return "自宅未設定";
    return `自宅から <strong>${pos.dist.toFixed(1)}km</strong> ／ <strong>${pos.dir}（${pos.eto}）</strong> ${pos.bearing.toFixed(1)}°`;
  }

  function popupHtml(spot) {
    return `
      <div class="popup-title">${escapeHtml(spot.name)} <small>（${escapeHtml(spot.pref)}）</small></div>
      ${spot.water ? `<div class="popup-water">💧 ${escapeHtml(spot.water)}</div>` : ""}
      <div>${escapeHtml(spot.riyaku)}</div>
      <div class="popup-pos">${positionTextFor(spot.lat, spot.lng)}</div>
      ${banSummaryHtml(spot.lat, spot.lng)}
      <div>📍 ${escapeHtml(spot.addr)}</div>
      ${spot.tel ? `<div>☎ ${escapeHtml(spot.tel)}</div>` : ""}
      <div>初穂料等: ${escapeHtml(spot.fee) || "情報なし"}</div>`;
  }

  function spotStatusClass(spot) {
    const pos = spotDirection(spot.lat, spot.lng);
    if (!pos || !current.judged) return "";
    const st = current.judged[state.banFocus].dirs[pos.dir];
    if (st.status === "max") return "spot-max";
    if (st.status === "kichi") return "spot-kichi";
    return "";
  }

  function renderSpots() {
    spotLayer.clearLayers();
    if (!isPremium()) return; // スポット表示は有料機能
    for (const spot of SPOTS) {
      const m = L.marker([spot.lat, spot.lng], { icon: spotIcon(spotStatusClass(spot)), title: spot.name });
      m.bindPopup(() => popupHtml(spot), { maxWidth: 280 });
      m.addTo(spotLayer);
      spot._marker = m;
    }
  }

  // ---------- スポット一覧 ----------
  function renderSpotList() {
    const ul = document.getElementById("spotList");
    ul.innerHTML = "";
    if (!isPremium()) {
      ul.innerHTML = `<li class="lock-note">🔒 全国${SPOTS.length}ヶ所のお水取りスポットはプレミアム（月額880円）で表示されます。</li>`;
      return;
    }
    const kichiOnly = document.getElementById("kichiOnly").checked;
    const rows = SPOTS.map(s => {
      const pos = spotDirection(s.lat, s.lng);
      const st = pos && current.judged ? current.judged[state.banFocus].dirs[pos.dir] : null;
      return { s, pos, st };
    });
    if (rows[0].pos) rows.sort((a, b) => a.pos.dist - b.pos.dist);

    for (const r of rows) {
      if (kichiOnly && (!r.st || (r.st.status !== "max" && r.st.status !== "kichi"))) continue;
      const li = document.createElement("li");
      const stHtml = r.st
        ? (r.st.status === "max" ? `<span class="sp-status st-max">◎</span>`
          : r.st.status === "kichi" ? `<span class="sp-status st-kichi">○</span>`
            : r.st.status === "kyo" ? `<span class="sp-status st-kyo">×</span>` : `<span class="sp-status">−</span>`)
        : "";
      li.innerHTML = `${stHtml}<span class="sp-name">${r.s.name}</span>` +
        (r.pos ? `<span class="sp-dir">${r.pos.dir}（${r.pos.eto}）</span><span class="sp-dist">${r.pos.dist.toFixed(1)}km</span>`
          : `<span class="sp-dist">${r.s.pref}</span>`);
      li.addEventListener("click", () => {
        closePanel();
        map.flyTo([r.s.lat, r.s.lng], Math.max(map.getZoom(), 13));
        r.s._marker.openPopup();
      });
      ul.appendChild(li);
    }
  }

  // ---------- ミニ盤・詳細モーダル ----------
  function centerNeedle() {
    const home = state.home;
    if (!home) return null;
    const c = map.getCenter();
    if (Geo.distanceKm(home.lat, home.lng, c.lat, c.lng) < 0.05) return null;
    const decl = Geo.declination(home.lat, home.lng);
    return Geo.displayBearing(Geo.bearingTrue(home.lat, home.lng, c.lat, c.lng), state.northMode, decl);
  }

  function renderMiniBans() {
    const needle = centerNeedle();
    for (const el of document.querySelectorAll(".mini-ban")) {
      const kind = el.dataset.kind;
      el.classList.toggle("focus", kind === state.banFocus);
      el.querySelector(".mini-svg").innerHTML = current.judged ? BanUI.mini(current.judged[kind], needle) : "";
    }
  }

  let modalKind = "day";
  function renderModal() {
    if (document.getElementById("banModal").classList.contains("hidden")) return;
    const [y, m, d] = state.date.split("-").map(Number);
    const youbi = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
    document.getElementById("modalDate").textContent = `${y}年${m}月${d}日（${youbi}）`;
    const p = activePerson();
    document.getElementById("modalPerson").textContent = p && current.mei
      ? `${p.name}: 本命星 ${BanUI.HOSHI[current.mei.honmei]} ／ 月命星 ${BanUI.HOSHI[current.mei.getsumei]}`
      : "人物が未登録です";
    for (const b of document.querySelectorAll(".modal-tabs button")) {
      b.classList.toggle("active", b.dataset.kind === modalKind);
    }
    document.getElementById("modalSvg").innerHTML = current.judged ? BanUI.detail(current.judged[modalKind], centerNeedle()) : "";
  }
  function openModal(kind) {
    modalKind = kind || state.banFocus;
    document.getElementById("banModal").classList.remove("hidden");
    renderModal();
  }

  // ---------- 日付 ----------
  function setDate(iso) {
    state.date = iso;
    refresh();
  }
  function shiftDate(unit, n) {
    const [y, m, d] = state.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (unit === "d") dt.setDate(dt.getDate() + n);
    if (unit === "m") dt.setMonth(dt.getMonth() + n);
    if (unit === "y") dt.setFullYear(dt.getFullYear() + n);
    setDate(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }

  // ---------- 人物管理 ----------
  function renderPersonList() {
    const ul = document.getElementById("personList");
    ul.innerHTML = "";
    for (const p of state.people) {
      const [by, bm, bd] = p.birth.split("-").map(Number);
      const mei = Koyomi.meiStars(by, bm, bd);
      const li = document.createElement("li");
      li.className = p.id === state.activePersonId ? "active" : "";
      li.innerHTML = `<span class="ps-name">${escapeHtml(p.name)}</span>` +
        `<span class="ps-mei">${by}/${bm}/${bd}<br>本命${Kigaku.KANSUJI[mei.honmei]}・月命${Kigaku.KANSUJI[mei.getsumei]}</span>`;
      li.addEventListener("click", () => { state.activePersonId = p.id; refresh(); });
      const del = document.createElement("button");
      del.textContent = "×";
      del.title = "削除";
      del.addEventListener("click", e => {
        e.stopPropagation();
        if (!confirm(`「${p.name}」を削除しますか?`)) return;
        state.people = state.people.filter(x => x.id !== p.id);
        if (state.activePersonId === p.id) state.activePersonId = state.people[0]?.id ?? null;
        refresh();
      });
      li.appendChild(del);
      ul.appendChild(li);
    }
  }
  function addPerson() {
    const name = document.getElementById("personName").value.trim();
    const birth = document.getElementById("personBirth").value;
    const gender = document.getElementById("personGender").value;
    if (!birth) { alert("生年月日を入力してください"); return; }
    const p = { id: Date.now().toString(36), name: name || `人物${state.people.length + 1}`, birth, gender };
    state.people.push(p);
    state.activePersonId = p.id;
    document.getElementById("personName").value = "";
    document.getElementById("personBirth").value = "";
    refresh();
  }

  // ---------- 自宅(基点) ----------
  function setHome(lat, lng) {
    state.home = { name: "自宅", lat, lng };
    refresh();
  }

  const candIcon = L.divIcon({
    className: "search-pin",
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.4 1 13c0 8.5 12 20 12 20s12-11.5 12-20C25 6.4 19.6 1 13 1z"
            fill="#7b1e26" stroke="#fffdf6" stroke-width="1.6"/>
      <circle cx="13" cy="13" r="4.2" fill="#fffdf6"/></svg>`,
    iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30]
  });
  const userPinIcon = L.divIcon({
    className: "user-pin",
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.4 1 13c0 8.5 12 20 12 20s12-11.5 12-20C25 6.4 19.6 1 13 1z"
            fill="#2a4b7c" stroke="#fffdf6" stroke-width="1.6"/>
      <circle cx="13" cy="13" r="4.2" fill="#fffdf6"/></svg>`,
    iconSize: [26, 34], iconAnchor: [13, 33], popupAnchor: [0, -30]
  });
  let candMarker = null, leadLine = null;
  const pinLayer = L.layerGroup().addTo(map);

  function clearCandidate() {
    if (candMarker) { candMarker.remove(); candMarker = null; }
    if (leadLine) { leadLine.remove(); leadLine = null; }
  }

  // ---- 置いたピン ----
  function addPin(lat, lng, name) {
    state.pins.push({ id: Date.now().toString(36), name: name || "ピン", lat, lng });
    refresh();
  }
  function removePin(id) {
    state.pins = state.pins.filter(p => p.id !== id);
    refresh();
  }
  function pinPopupNode(pin) {
    const div = document.createElement("div");
    div.innerHTML =
      `<div class="popup-title">📌 ${escapeHtml(pin.name)}</div>` +
      `<div class="popup-pos">${positionTextFor(pin.lat, pin.lng)}</div>` +
      banSummaryHtml(pin.lat, pin.lng);
    const row = document.createElement("div");
    row.className = "popup-btnrow";
    const btnDel = document.createElement("button");
    btnDel.className = "popup-btn";
    btnDel.textContent = "ピンを外す";
    btnDel.addEventListener("click", () => removePin(pin.id));
    const btnHome = document.createElement("button");
    btnHome.className = "popup-btn sub";
    btnHome.textContent = "ここを自宅にする";
    btnHome.addEventListener("click", () => { removePin(pin.id); setHome(pin.lat, pin.lng); });
    row.append(btnDel, btnHome);
    div.appendChild(row);
    return div;
  }
  function renderPins() {
    pinLayer.clearLayers();
    for (const pin of state.pins) {
      if (state.home) {
        L.polyline([[state.home.lat, state.home.lng], [pin.lat, pin.lng]], {
          color: "#2a4b7c", weight: 1.6, dashArray: "6 6", opacity: 0.8, interactive: false
        }).addTo(pinLayer);
      }
      L.marker([pin.lat, pin.lng], { icon: userPinIcon, zIndexOffset: 400, title: pin.name })
        .bindPopup(() => pinPopupNode(pin), { maxWidth: 260 })
        .addTo(pinLayer);
    }
  }

  // ---- タップ・検索の候補ピン ----
  function candidatePopupNode(lat, lng, title) {
    const div = document.createElement("div");
    div.innerHTML =
      `<div class="popup-title">${escapeHtml(title)}</div>` +
      (state.home ? `<div class="popup-pos">${positionTextFor(lat, lng)}</div>` : "") +
      (state.home ? banSummaryHtml(lat, lng) : "");
    const row = document.createElement("div");
    row.className = "popup-btnrow";
    const btnPin = document.createElement("button");
    btnPin.className = "popup-btn";
    btnPin.textContent = "ここにピンを置く";
    btnPin.addEventListener("click", () => { clearCandidate(); addPin(lat, lng, title === "この地点" ? "ピン" : title); });
    const btnSet = document.createElement("button");
    btnSet.className = "popup-btn";
    btnSet.textContent = state.home ? "ここを自宅にする" : "自宅に設定する";
    btnSet.addEventListener("click", () => { clearCandidate(); setHome(lat, lng); });
    const btnClose = document.createElement("button");
    btnClose.className = "popup-btn sub";
    btnClose.textContent = "閉じる";
    btnClose.addEventListener("click", () => { clearCandidate(); updateBanner(); });
    row.append(btnPin, btnSet, btnClose);
    div.appendChild(row);
    return div;
  }
  function showCandidate(lat, lng, title) {
    clearCandidate();
    candMarker = L.marker([lat, lng], { icon: candIcon, zIndexOffset: 600 }).addTo(map);
    if (state.home) {
      leadLine = L.polyline([[state.home.lat, state.home.lng], [lat, lng]], {
        color: "#7b1e26", weight: 2, dashArray: "7 6", interactive: false
      }).addTo(map);
    }
    candMarker.bindPopup(candidatePopupNode(lat, lng, title), { maxWidth: 270 }).openPopup();
  }

  map.on("click", e => {
    showCandidate(e.latlng.lat, e.latlng.lng, "この地点");
  });

  async function searchAddress() {
    const q = document.getElementById("baseAddr").value.trim();
    const ul = document.getElementById("baseCandidates");
    ul.innerHTML = "";
    if (!q) return;
    ul.innerHTML = "<li>検索中…</li>";
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
      const list = await res.json();
      ul.innerHTML = "";
      if (!list.length) { ul.innerHTML = "<li>見つかりませんでした</li>"; return; }
      for (const f of list.slice(0, 6)) {
        const li = document.createElement("li");
        li.textContent = f.properties.title;
        li.addEventListener("click", () => {
          const [lng, lat] = f.geometry.coordinates;
          ul.innerHTML = "";
          document.getElementById("baseAddr").value = "";
          closePanel();
          map.flyTo([lat, lng], Math.max(map.getZoom(), 13));
          showCandidate(lat, lng, f.properties.title);
        });
        ul.appendChild(li);
      }
    } catch {
      ul.innerHTML = "<li>検索に失敗しました（通信状態をご確認ください）</li>";
    }
  }

  function useGps() {
    if (!navigator.geolocation) { alert("この端末では位置情報を利用できません"); return; }
    navigator.geolocation.getCurrentPosition(
      pos => map.flyTo([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 13)),
      () => alert("現在地を取得できませんでした")
    );
  }

  // ---------- 情報表示 ----------
  function updateInfoBar() {
    const home = state.home;
    const elBase = document.getElementById("infoBase");
    const elCenter = document.getElementById("infoCenter");
    if (!home) { elBase.textContent = "自宅未設定"; elCenter.textContent = ""; return; }
    elBase.textContent = "⌂ 自宅";
    const c = map.getCenter();
    const pos = spotDirection(c.lat, c.lng);
    elCenter.textContent =
      `＋地図中心: ${pos.dist.toFixed(pos.dist < 10 ? 2 : 1)}km ${pos.dir}（${pos.eto}） 方位角${pos.bearing.toFixed(1)}°`;
  }
  function updateDeclInfo() {
    const el = document.getElementById("declInfo");
    if (!state.home) { el.textContent = ""; return; }
    const d = Geo.declination(state.home.lat, state.home.lng);
    const dg = Math.floor(d), dm = Math.round((d - dg) * 60);
    el.textContent = `自宅の磁気偏角: 西偏 ${dg}°${String(dm).padStart(2, "0")}′（地理院2020.0年値近似）`;
  }
  function updateHomeStatus() {
    const el = document.getElementById("homeStatus");
    if (!state.home) { el.textContent = "自宅: 未設定です。検索するか地図をタップして「ここを自宅にする」で設定してください。"; return; }
    el.innerHTML = `自宅: 設定済み（緯度 ${state.home.lat.toFixed(5)} / 経度 ${state.home.lng.toFixed(5)}）`;
  }
  function showBanner(msg) {
    const el = document.getElementById("banner");
    el.querySelector("p").innerHTML = msg;
    el.classList.remove("hidden");
  }
  function updateBanner() {
    const el = document.getElementById("banner");
    if (!state.home) {
      el.querySelector("p").innerHTML = "まずメニュー(☰)から<strong>自宅（基点）</strong>を設定してください。";
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  // ---------- プレミアム機能の描画 ----------
  function lockHtml(msg) {
    return `<div class="lock-box">🔒 ${msg}<br><span>プレミアム（月額880円）で解錠されます。</span></div>`;
  }

  // 本命星が月盤で廻座する宮(方位名 or 中宮)
  function honmeiMiyaDir() {
    if (!current.judged || !current.mei) return null;
    if (current.koyomi.monthStar === current.mei.honmei) return "中宮";
    for (const d of Kigaku.DIRS) {
      if (current.judged.month.dirs[d].star === current.mei.honmei) return d;
    }
    return null;
  }

  function renderThemeCard() {
    const el = document.getElementById("themeCard");
    if (!isPremium()) {
      el.innerHTML = lockHtml("あなたの本命星が今月どの宮に入るかで「今月のテーマ」が決まります。プレミアムでは、そのテーマの運気をさらに強める専用の周波数音源をお届け。全身で浴びることで、自分と場の周波数が変わり、現実が変わっていきます。");
      return;
    }
    const p = activePerson();
    const dir = honmeiMiyaDir();
    if (!p || !dir) { el.innerHTML = `<p class="note">人物を登録すると表示されます。</p>`; return; }
    const t = THEMES[dir];
    const m = Number(state.date.split("-")[1]);
    el.innerHTML = `
      <div class="theme-card">
        <div class="theme-title">${t.theme}</div>
        <div class="theme-why">${escapeHtml(p.name)}さんの本命星「${BanUI.HOSHI[current.mei.honmei]}」は、${m}月の月盤で<strong>${t.miya}</strong>に廻座しています。</div>
        <div class="theme-desc">${t.desc}</div>
        <audio controls preload="none" src="${t.audio}"></audio>
        <div class="onkyo-note">
          <strong>♪ テーマ音源（周波数）とは？</strong><br>
          この音源は、今月のテーマ「${t.theme}」の運気をさらに強め、輝かせるための周波数です。全身で浴びることで、あなた自身と場の周波数が変わり、現実が変わっていきます。<br>
          <strong>聴き方のポイント:</strong> イヤホンで耳だけで聴いてもかまいませんが、おすすめは<strong>イヤホンをせずに音を流し、全身で浴びる</strong>こと。お部屋にも聴かせて、場や環境の周波数も一緒に整えましょう。1日に何度聴いても大丈夫です。
        </div>
        <div class="note">※テーマ音源は現在サンプル版です。毎月の詳しい過ごし方は配信記事をご覧ください。</div>
      </div>`;
  }

  // 月盤・日盤がともに吉方位になる日を抽出
  // ★★★トリプル大開運日 = 年盤・月盤・日盤の中宮が同じ星になる日(三盤揃い)で、
  // かつその方位の吉が破などで潰れていない日。年に数日しかない。
  // (例: 2026年=一白年の三盤揃いは9/7・9/16・9/25・10/4。本命七赤/月命八白の人は
  //  一白盤の吉方位が北西のみで、9/16は日破(亥)が北西に付くため除外→9/7・9/25・10/4)
  function computeRecDays() {
    if (!current.mei) return [];
    const [y, m] = state.date.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const ok = s => s === "max" || s === "kichi";
    const out = [];
    for (let d = 1; d <= last; d++) {
      const koy = Koyomi.info(y, m, d);
      const sameBan = koy.yearStar === koy.monthStar && koy.monthStar === koy.dayStar;
      const jy = Kigaku.judge(koy.yearStar, "year", koy, current.mei);
      const jm = Kigaku.judge(koy.monthStar, "month", koy, current.mei);
      const jd = Kigaku.judge(koy.dayStar, "day", koy, current.mei);
      const dirs = [];
      let triple = false;
      for (const dir of Kigaku.DIRS) {
        if (ok(jm.dirs[dir].status) && ok(jd.dirs[dir].status)) {
          const isTriple = sameBan && ok(jy.dirs[dir].status);
          if (isTriple) triple = true;
          dirs.push({
            dir,
            grade: isTriple ? "★★★" : (jm.dirs[dir].status === "max" && jd.dirs[dir].status === "max") ? "◎" : "○",
            tendo: jm.dirs[dir].tendo
          });
        }
      }
      if (dirs.length) out.push({ d, dirs, triple });
    }
    return out;
  }

  function renderRecDays() {
    const el = document.getElementById("recDays");
    if (!isPremium()) {
      el.innerHTML = lockHtml("月盤・日盤がそろって吉方位になる「お水取りに行くべき日」を自動で一覧にします。");
      return;
    }
    if (!activePerson()) { el.innerHTML = `<p class="note">人物を登録すると表示されます。</p>`; return; }
    // 方位ごとのスポット数(自宅設定時のみ)
    const spotCount = {};
    if (state.home) {
      for (const s of SPOTS) {
        const pos = spotDirection(s.lat, s.lng);
        spotCount[pos.dir] = (spotCount[pos.dir] || 0) + 1;
      }
    }
    const [y, m] = state.date.split("-").map(Number);
    const days = computeRecDays();
    if (!days.length) {
      el.innerHTML = `<p class="note">${m}月は月盤・日盤がそろって吉になる日がありません。前後の月もご覧ください。</p>`;
      return;
    }
    const ul = document.createElement("ul");
    ul.id = "recDayList";
    for (const row of days) {
      const youbi = "日月火水木金土"[new Date(y, m - 1, row.d).getDay()];
      const dirTexts = row.dirs.map(x =>
        `<span class="rd-grade${x.grade === "★★★" ? " rd-star" : ""}">${x.grade}</span>${x.dir}${x.tendo ? "〈天道〉" : ""}` +
        (state.home && spotCount[x.dir] ? `<small>(${spotCount[x.dir]}件)</small>` : "")
      ).join("　");
      const li = document.createElement("li");
      if (row.triple) li.className = "rd-triple";
      li.innerHTML = `<span class="rd-date">${m}/${row.d}(${youbi})</span> ${row.triple ? `<span class="rd-triple-badge">大開運日</span>` : ""}${dirTexts}`;
      li.addEventListener("click", () => {
        setDate(`${y}-${String(m).padStart(2, "0")}-${String(row.d).padStart(2, "0")}`);
      });
      ul.appendChild(li);
    }
    el.innerHTML = `<p class="note">★★★=年盤・月盤・日盤が同じ盤になる<strong>トリプル大開運日</strong>(三盤揃い・年に数日) ◎=月盤・日盤とも最大吉方 ○=どちらも吉方。タップするとその日の盤に切り替わります。</p>`;
    el.appendChild(ul);
  }

  function renderPremiumBox() {
    const el = document.getElementById("premiumBox");
    if (isPremium()) {
      el.innerHTML = `<p class="note">✨ 解錠済みです。この端末では入力し直す必要はありません。</p>`;
      return;
    }
    el.innerHTML = `
      <p class="note">お水取りスポット表示・推奨日・今月のテーマ・テーマ音源が使えるようになります。<br>
      ${PREMIUM_URL ? `<a href="${PREMIUM_URL}" target="_blank" rel="noopener">購入ページへ</a>` : "販売ページは準備中です。"}
      購入すると「会員コード」が届きます。<strong>一度入力すれば、それ以降は自動で解錠されたままです。</strong></p>
      <div class="base-add">
        <input id="pmCode" type="text" placeholder="会員コードを入力">
        <button id="pmUnlock">解錠する</button>
      </div>
      <p id="pmMsg" class="note"></p>`;
    el.querySelector("#pmUnlock").addEventListener("click", () => {
      const v = el.querySelector("#pmCode").value.trim().toUpperCase();
      if (validCodes().includes(v)) {
        state.premiumCode = v;
        refresh();
      } else {
        el.querySelector("#pmMsg").textContent = "会員コードが違います。購入時に届いたコードをご確認ください。";
      }
    });
  }

  // ---------- パネル ----------
  function openPanel() {
    document.getElementById("panel").classList.remove("hidden");
    document.getElementById("panelOverlay").classList.remove("hidden");
    renderSpotList();
  }
  function closePanel() {
    document.getElementById("panel").classList.add("hidden");
    document.getElementById("panelOverlay").classList.add("hidden");
  }

  // ---------- 一括更新 ----------
  function refresh() {
    map.closePopup();
    recalc();
    saveState();
    document.getElementById("datePick").value = state.date;
    document.body.classList.toggle("ban-collapsed", !!state.banCollapsed);
    document.getElementById("banToggle").textContent = state.banCollapsed ? "▴" : "▾";
    redrawSectors();
    renderPins();
    renderSpots();
    renderSpotList();
    renderPersonList();
    renderThemeCard();
    renderRecDays();
    renderPremiumBox();
    renderAnnounce();
    renderMiniBans();
    renderModal();
    updateInfoBar();
    updateDeclInfo();
    updateHomeStatus();
    updateBanner();
    map.invalidateSize();
  }

  // ---------- イベント ----------
  document.getElementById("menuBtn").addEventListener("click", openPanel);
  document.getElementById("closePanel").addEventListener("click", closePanel);
  document.getElementById("panelOverlay").addEventListener("click", closePanel);
  document.getElementById("locateBtn").addEventListener("click", useGps);
  document.getElementById("baseSearchBtn").addEventListener("click", searchAddress);
  document.getElementById("baseAddr").addEventListener("keydown", e => { if (e.key === "Enter") searchAddress(); });
  document.getElementById("gotoGpsBtn").addEventListener("click", () => { closePanel(); useGps(); });
  document.getElementById("personAddBtn").addEventListener("click", addPerson);
  document.getElementById("kichiOnly").addEventListener("change", renderSpotList);

  document.getElementById("dnToday").addEventListener("click", () => setDate(todayISO()));
  document.getElementById("dnPrevY").addEventListener("click", () => shiftDate("y", -1));
  document.getElementById("dnNextY").addEventListener("click", () => shiftDate("y", 1));
  document.getElementById("dnPrevM").addEventListener("click", () => shiftDate("m", -1));
  document.getElementById("dnNextM").addEventListener("click", () => shiftDate("m", 1));
  document.getElementById("dnPrevD").addEventListener("click", () => shiftDate("d", -1));
  document.getElementById("dnNextD").addEventListener("click", () => shiftDate("d", 1));
  document.getElementById("datePick").addEventListener("change", e => { if (e.target.value) setDate(e.target.value); });
  document.getElementById("banToggle").addEventListener("click", () => {
    state.banCollapsed = !state.banCollapsed;
    refresh();
  });

  for (const el of document.querySelectorAll(".mini-ban")) {
    el.addEventListener("click", () => {
      state.banFocus = el.dataset.kind;
      refresh();
    });
  }
  document.getElementById("banDetailBtn").addEventListener("click", () => openModal(state.banFocus));
  document.getElementById("modalClose").addEventListener("click", () => document.getElementById("banModal").classList.add("hidden"));
  document.getElementById("banModal").addEventListener("click", e => {
    if (e.target.id === "banModal") document.getElementById("banModal").classList.add("hidden");
  });
  for (const b of document.querySelectorAll(".modal-tabs button")) {
    b.addEventListener("click", () => { modalKind = b.dataset.kind; renderModal(); });
  }

  const sectorSel = document.getElementById("sectorMode");
  const northSel = document.getElementById("northMode");
  sectorSel.value = state.sectorMode;
  northSel.value = state.northMode;
  sectorSel.addEventListener("change", () => { state.sectorMode = sectorSel.value; refresh(); });
  northSel.addEventListener("change", () => { state.northMode = northSel.value; refresh(); });

  map.on("moveend", () => { updateInfoBar(); renderMiniBans(); });
  map.on("zoomend", redrawLabels);

  // ---------- 初回オンボーディング ----------
  if (!state.onboarded) {
    document.getElementById("onboard").classList.remove("hidden");
  }
  document.getElementById("onboardStart").addEventListener("click", () => {
    state.onboarded = true;
    saveState();
    document.getElementById("onboard").classList.add("hidden");
    openPanel();
  });

  // ---------- 初期化 ----------
  refresh();
  loadAnnounce();
  if (state.home) map.setView([state.home.lat, state.home.lng], 9);
})();
