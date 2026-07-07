// 「今月のあなたのテーマ」 9宮テーマ定義
// 本命星が月盤でどの宮に廻座しているかで決まる。音源は宮テーマ別に9本(現在はサンプル)。
const THEMES = {
  "北": { miya: "坎宮", theme: "内省と自己受容", desc: "心の深くと向き合い、ありのままの自分を受け入れて整える月。焦らず、静かに充電しましょう。", audio: "audio/sample.mp3" },
  "北東": { miya: "艮宮", theme: "転換とリセット", desc: "流れが切り替わる月。環境・習慣・持ち物の入れ替えが吉と出ます。", audio: "audio/sample.mp3" },
  "東": { miya: "震宮", theme: "始動とチャレンジ", desc: "新しいことを始めるのに最適な月。直感で動くと追い風が吹きます。", audio: "audio/sample.mp3" },
  "南東": { miya: "巽宮", theme: "ご縁と信頼", desc: "人とのつながりが運を運ぶ月。出会い・約束・信用を大切に。", audio: "audio/sample.mp3" },
  "南": { miya: "離宮", theme: "表現と注目", desc: "あなたの才能が輝き、人の目に留まる月。美しさと発信がテーマです。", audio: "audio/sample.mp3" },
  "南西": { miya: "坤宮", theme: "土台づくりと育成", desc: "コツコツ積み上げたことが実を結ぶ準備の月。丁寧な暮らしが開運の鍵。", audio: "audio/sample.mp3" },
  "西": { miya: "兌宮", theme: "喜びと実り", desc: "楽しみ・豊かさ・金運がテーマの月。よく笑うほど運気が巡ります。", audio: "audio/sample.mp3" },
  "北西": { miya: "乾宮", theme: "完成と勝負", desc: "これまでの努力が形になる月。大きな決断にも向いています。", audio: "audio/sample.mp3" },
  "中宮": { miya: "中宮", theme: "中心に立つ・整理と充電", desc: "注目が集まる反面、大きく動きにくい月。手放しと整理で次の流れを呼び込みましょう。", audio: "audio/sample.mp3" }
};
if (typeof module !== "undefined") module.exports = THEMES;
