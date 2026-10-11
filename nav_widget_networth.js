// Oranger · 桌面小组件 (Scriptable) —— 「全部净资产」口径
//
// 用法: App Store 装「Scriptable」→ 新建脚本 → 粘贴全文 → 命名 "Oranger NetWorth" → 桌面加 Scriptable 组件。
//       (与 NAV 口径的 "Oranger" 脚本并存; 两者缓存文件不同, 互不覆盖)
//       点组件 = 打开看板网站 (净资产页)。
//
// 口径: 全部净资产 = 证券(美股+港股) + 券商现金 + 加密 + DX + 银行现金 + 人民币资产 + 強積金 MPF − 信用卡负债
// 数据源: 看板 networth.json (GitHub Pages, 每 10 分钟刷新)。断网时用上次缓存。
// 版式: 深/浅色跟随系统 · 中/大尺寸含三桶占比 · 小尺寸只留核心两行

const DATA_URL = "https://oranger36.github.io/portfolio-cockpit/networth.json";
const SITE_URL = "https://oranger36.github.io/portfolio-cockpit/#networth";
const CACHE = "oranger_nw_cache.json";

// ── 配色: 跟随手机的浅色/深色 ────────────────────────────────
function palette() {
  const dark = Device.isUsingDarkAppearance();
  return dark
    ? { bgTop: new Color("#121215"), bg: new Color("#000000"), fg: new Color("#ffffff"),
        dim: new Color("#9a9aa0"), grid: new Color("#3a3a3f"),
        up: "#30d158", down: "#ff453a" }
    : { bgTop: new Color("#ffffff"), bg: new Color("#eeeef2"), fg: new Color("#1c1c1e"),
        dim: new Color("#6c6c70"), grid: new Color("#e5e5ea"),
        up: "#059669", down: "#e11d48" };
}
const DARKMODE = Device.isUsingDarkAppearance();
const UP_HEX = DARKMODE ? "#30d158" : "#059669";     // 绿涨
const DOWN_HEX = DARKMODE ? "#ff453a" : "#e11d48";   // 红跌 (欧惯例)
const UP = new Color(UP_HEX);
const DOWN = new Color(DOWN_HEX);
const sigColor = (v) => (v >= 0 ? UP : DOWN);
const arrow = (v) => (v >= 0 ? "\u25b2 " : "\u25bc ");

// ── 取数 (带本地缓存兜底) ────────────────────────────────────
const SNAPSHOT_URL = "https://oranger36.github.io/portfolio-cockpit/snapshot.json";
const EX_CACHE = "oranger_nw_ex_cache.json";
async function loadExposure() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), EX_CACHE);
  try {
    const req = new Request(SNAPSHOT_URL + "?t=" + Date.now());
    req.timeoutInterval = 20;
    const d = await req.loadJSON();
    fm.writeString(path, JSON.stringify(d));
    return d;
  } catch (e) {
    if (fm.fileExists(path)) return JSON.parse(fm.readString(path));
    return null;
  }
}
async function loadData() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CACHE);
  try {
    const req = new Request(DATA_URL + "?t=" + Date.now());
    req.timeoutInterval = 20;
    const d = await req.loadJSON();
    fm.writeString(path, JSON.stringify(d));
    return d;
  } catch (e) {
    if (fm.fileExists(path)) return JSON.parse(fm.readString(path));
    return null;
  }
}

function hkShort(v) {                       // 小字用: HK$1.25M / HK$1,253k / -HK$136k
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return sign + "HK$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + "HK$" + Math.round(a / 1e3) + "k";
  return sign + "HK$" + Math.round(a);
}

function hk(v, signed) {
  const sign = signed ? (v >= 0 ? "+" : "-") : (v < 0 ? "-" : "");
  return sign + "HK$" + Math.abs(Math.round(v)).toLocaleString("en-US");
}

// ── 定宽三列行: [标签][金额][占比/百分比] ─────────────────────
// 两条经验(踩过坑):
//   1) 不要在 text 上设 size —— Scriptable 会塞进固定盒子并【顶对齐】; 用【定宽 stack 容器】。
//   2) 三个元素用【同一字号】, 且字号由两行里最长金额统一决定, 避免 Scriptable 单独缩字。
function statMetrics(compact, amounts) {
  const box = compact ? 96 : 110;
  const fsMax = compact ? 10 : 12;
  const longest = Math.max.apply(null, amounts.map((a) => String(a).length).concat([1]));
  const fit = Math.floor((box - 4) / (0.58 * longest));   // 系统字体数字宽≈0.58em
  return { box: box, labW: compact ? 52 : 64, pctW: compact ? 54 : 62, msf: 0.85,
           fs: Math.max(compact ? 8 : 9, Math.min(fsMax, fit)), longest: longest };
}

// color: 金额列颜色 (净值行用前景色, 负债行用红); pctTxt: 已格式化的百分比字符串(如 "30.1%"), 可为空
function levelRow(w, label, amountText, pctTxt, color, p, M) {
  const fs = M.fs, box = M.box;
  const row = w.addStack();
  row.layoutHorizontally();

  const lab = row.addStack();                       // 定宽容器: 标签列
  lab.size = new Size(M.labW, 0);
  const lt = lab.addText(label);
  lt.font = Font.systemFont(fs);
  lt.textColor = p.dim;
  lt.lineLimit = 1;
  lt.minimumScaleFactor = 0.8;                      // 「人民币资产」等 5 字标签不换行/不截断

  const amtBox = row.addStack();                    // 定宽容器: 金额列
  amtBox.size = new Size(box, 0);
  const amt = amtBox.addText(amountText);
  amt.font = Font.semiboldSystemFont(fs);
  amt.textColor = color;
  amt.lineLimit = 1;
  amt.minimumScaleFactor = M.msf;

  row.addSpacer();
  const pcBox = row.addStack();                     // 定宽容器: 百分比列(两行右缘对齐)
  pcBox.size = new Size(M.pctW, 0);
  if (!pctTxt) return row;
  const pc = pcBox.addText(pctTxt);
  pc.font = Font.systemFont(fs);
  pc.textColor = p.dim;
  pc.lineLimit = 1;
  pc.minimumScaleFactor = M.msf;
  return row;
}

// ── 折线 (预留给净资产历史; 现在数据点不足, 暂不绘制) ──────────
function sparkline(series, w, h, p) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  if (!series || series.length < 2) return null;

  const min = Math.min(...series), max = Math.max(...series);
  const span = (max - min) || 1;
  const pad = h * 0.17;
  const X = (i) => (i / (series.length - 1)) * (w - 4) + 2;
  const Y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);

  if (min < 0 && max > 0) {
    const path = new Path();
    path.move(new Point(0, Y(0)));
    path.addLine(new Point(w, Y(0)));
    ctx.addPath(path);
    ctx.setStrokeColor(p.grid);
    ctx.setLineWidth(0.5);
    ctx.strokePath();
  }

  const col = sigColor(series[series.length - 1]);
  const area = new Path();
  area.move(new Point(X(0), h - 1));
  for (let i = 0; i < series.length; i++) area.addLine(new Point(X(i), Y(series[i])));
  area.addLine(new Point(X(series.length - 1), h - 1));
  ctx.addPath(area);
  ctx.setFillColor(new Color(series[series.length - 1] >= 0 ? UP_HEX : DOWN_HEX, 0.16));
  ctx.fillPath();

  const line = new Path();
  line.move(new Point(X(0), Y(series[0])));
  for (let i = 1; i < series.length; i++) line.addLine(new Point(X(i), Y(series[i])));
  ctx.addPath(line);
  ctx.setStrokeColor(col);
  ctx.setLineWidth(2);
  ctx.strokePath();

  const dot = new Path();
  dot.addEllipse(new Rect(X(series.length - 1) - 2, Y(series[series.length - 1]) - 2, 4, 4));
  ctx.addPath(dot);
  ctx.setFillColor(col);
  ctx.fillPath();

  return ctx.getImage();
}

function tinyLabel(w, text, color, size = 9) {
  const t = w.addText(text);
  t.font = Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

function bucketOf(d, key) {
  return (d.buckets || []).find((b) => b.key === key) || { value_hkd: 0, pct: 0 };
}
function accountOf(d, key) {
  return (d.accounts || []).find((a) => a.key === key) || { value_hkd: 0 };
}

// ── 组件主体 ─────────────────────────────────────────────────
async function build() {
  const p = palette();
  const w = new ListWidget();
  const bgGrad = new LinearGradient();
  bgGrad.colors = [p.bgTop, p.bg];
  bgGrad.locations = [0, 1];
  w.backgroundGradient = bgGrad;
  w.url = SITE_URL;
  w.setPadding(15, 18, 15, 18);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const d = await loadData();
  const snap = await loadExposure();
  const ex0 = Number((snap || {}).exposure_hkd) || 0;
  if (!d || !d.net_worth_hkd) {
    const t = w.addText("读不到数据\n(网络?)");
    t.font = Font.systemFont(12);
    t.textColor = p.dim;
    return w;
  }

  const fam = config.widgetFamily || "medium";
  const small = fam === "small";
  const large = fam === "large";

  const nw = Number(d.net_worth_hkd) || 0;
  const alloc = Number(d.alloc_base_hkd) || 0;
  const mpf = Number(d.alloc_extra_hkd) || 0;
  const liab = Number(d.liabilities_hkd) || 0;
  const cash = Number((d.cash || {}).value_hkd) || 0;
  const crypto = Number(accountOf(d, "hl").value_hkd) || 0;
  const rmb = bucketOf(d, "rmb"), hkd = bucketOf(d, "hkd"), usd = bucketOf(d, "usd");

  // 标题行
  const head = w.addStack();
  head.layoutHorizontally();
  if (!small) {
    const title = head.addText("Oranger · 全部净资产");
    title.font = Font.semiboldSystemFont(10);
    title.textColor = p.dim;
    title.lineLimit = 1;
  }
  head.addSpacer();
  if (ex0) { tinyLabel(head, "总敞口 " + hkShort(ex0), p.dim, small ? 8 : 9); head.addSpacer(8); }   // 用户: 与净资产并列显示
  tinyLabel(head, (d.generated_at || "").slice(11, 16), p.dim, small ? 8 : 9);
  w.addSpacer(small ? 4 : 6);

  // 全部净资产 (主数字)
  const navRow = w.addStack();
  navRow.layoutHorizontally();
  navRow.centerAlignContent();
  const navT = navRow.addText(hk(nw, false));
  navT.font = Font.semiboldSystemFont(small ? 24 : (large ? 38 : 30));
  navT.textColor = p.fg;
  navT.minimumScaleFactor = 0.6;
  navT.lineLimit = 1;
  w.addSpacer(small ? 4 : 6);

  // 可配置 / 強積金 (小字一行)
  const sub = w.addStack();
  sub.layoutHorizontally();
  tinyLabel(sub, "可配置 " + hkShort(alloc), p.dim, small ? 8 : 10);
  sub.addSpacer(8);
  if (!small) tinyLabel(sub, "強積金 " + hkShort(mpf), p.dim, 10);
  w.addSpacer(small ? 7 : 10);

  // 小尺寸: 只再给一行核心(信用卡负债), 腾出空间
  if (small) {
    const srow = w.addStack();
    srow.layoutHorizontally();
    tinyLabel(srow, "信用卡负债", p.dim, 9);
    srow.addSpacer();
    const lt = srow.addText("-" + hkShort(liab));
    lt.font = Font.semiboldSystemFont(9);
    lt.textColor = DOWN;
    lt.lineLimit = 1;
    return w;
  }

  // 三桶 (资产配置): 金额 + 占可配置%
  const amounts = [hk(rmb.value_hkd, false), hk(hkd.value_hkd, false), hk(usd.value_hkd, false)];
  const M = statMetrics(false, amounts);
  levelRow(w, "人民币资产", amounts[0], (rmb.pct || 0).toFixed(1) + "%", p.fg, p, M);
  w.addSpacer(8);
  levelRow(w, "港币资产", amounts[1], (hkd.pct || 0).toFixed(1) + "%", p.fg, p, M);
  w.addSpacer(8);
  levelRow(w, "美元资产", amounts[2], (usd.pct || 0).toFixed(1) + "%", p.fg, p, M);

  if (large) {
    w.addSpacer(10);
    const extra = w.addStack();
    extra.layoutHorizontally();
    const ex = (k, v, col) => {
      const st = extra.addStack();
      st.layoutVertically();
      tinyLabel(st, k, p.dim, 8);
      const t = st.addText(v);
      t.font = Font.semiboldSystemFont(11);
      t.textColor = col || p.fg;
      extra.addSpacer();
    };
    ex("银行现金", hkShort(cash));
    ex("信用卡负债", "-" + hkShort(liab), DOWN);
    ex("加密", hkShort(crypto));
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
