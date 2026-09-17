// Oranger Portfolio · 桌面小组件 (Scriptable)
//
// 用法:
//   1. App Store 装免费 app「Scriptable」→ 右上 + 新建脚本 → 把本文件全文粘贴 → 命名 "Oranger"
//   2. 回桌面长按 → 左上 + → 搜索 Scriptable → 选尺寸(建议「中」或「大」) → 添加
//   3. 长按刚加的组件 → 编辑组件 → Script 选 "Oranger"
//   4. 点组件 = 直接打开看板网站
//
// 特性: 深/浅色跟随系统 · 中间尺寸含收益率迷你折线 · 断网时用上次缓存值
// 数据源: 看板每 15 分钟刷新一次的 snapshot.json (GitHub Pages)

const DATA_URL = "https://oranger36.github.io/portfolio-cockpit/snapshot.json";
const SITE_URL = "https://oranger36.github.io/portfolio-cockpit/#cockpit";
const CACHE = "oranger_widget_cache.json";
const DAYS = 30;                      // 折线取最近 N 个交易日

// ── 配色: 跟随手机的浅色/深色 ────────────────────────────────
function palette() {
  const dark = Device.isUsingDarkAppearance();
  return dark
    ? { bgTop: new Color("#121215"), bg: new Color("#000000"), fg: new Color("#ffffff"),
        dim: new Color("#9a9aa0"), line: new Color("#30d158"), grid: new Color("#3a3a3f"),
        card: new Color("#1f1f23") }
    : { bgTop: new Color("#ffffff"), bg: new Color("#eeeef2"), fg: new Color("#1c1c1e"),
        dim: new Color("#6c6c70"), line: new Color("#0a84ff"), grid: new Color("#e5e5ea"),
        card: new Color("#ffffff") };
}
// 深色下用更亮的 iOS 涨跌色(暗底上对比度更好), 浅色沿用原色
const DARKMODE = Device.isUsingDarkAppearance();
const UP_HEX = DARKMODE ? "#30d158" : "#059669";     // 绿涨
const DOWN_HEX = DARKMODE ? "#ff453a" : "#e11d48";   // 红跌 (欧惯例)
const UP = new Color(UP_HEX);
const DOWN = new Color(DOWN_HEX);
const sigColor = (v) => (v >= 0 ? UP : DOWN);
// 胶囊底色: 同色低透明度 (原生组件里的"涨跌 pill"就是这个做法)
const tint = (v, a) => new Color(v >= 0 ? UP_HEX : DOWN_HEX, a);
const arrow = (v) => (v >= 0 ? "\u25b2 " : "\u25bc ");   // ▲ / ▼

// ── 取数 (带本地缓存兜底) ────────────────────────────────────
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

function hkShort(v) {                       // 小字用: HK$1.25M / HK$1,253k
  const a = Math.abs(v);
  if (a >= 1e6) return "HK$" + (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return "HK$" + Math.round(v / 1e3) + "k";
  return "HK$" + Math.round(v);
}

function hk(v, signed) {
  const sign = signed ? (v >= 0 ? "+" : "-") : (v < 0 ? "-" : "");
  return sign + "HK$" + Math.abs(Math.round(v)).toLocaleString("en-US");
}

// ── 当日收益 / 收益率: 净值序列最后一点 vs 前一日 ────────────────
function dayStats(s) {
  // 当日口径(用户 2026-09-19 明确): 基准 = 本地 0 点那一跳的净值, 与看板「今日盈亏」完全一致
  const cur = Number(s && s.nav_hkd) || 0;
  const p0 = Number(s && s.prev_nav_hkd) || 0;
  if (p0 && cur) return { pnl: cur - p0, pct: (cur / p0 - 1) * 100 };
  const ns = (s && s.nav_series) || [];                      // 兜底: 老数据没有 prev_nav_hkd
  if (ns.length < 2) return null;
  const prev = Number(ns[ns.length - 2].nav) || 0;
  const c2 = Number(ns[ns.length - 1].nav) || 0;
  if (!prev) return null;
  return { pnl: c2 - prev, pct: (c2 / prev - 1) * 100 };
}

// 一行统计: [标签][金额][百分比]
// 两条经验(踩过坑):
//   1) 不要在 text 上设 size —— Scriptable 会把文字塞进固定盒子并【顶对齐】,
//      于是小字号标签和大字号数字的基线看着不齐。改用【固定宽度的空 stack 做容器】,
//      容器里的文字保持自身排版, 高度自适应。
//   2) 三个元素用【同一字号】—— 基线天然对齐, 观感也统一(用户要求「调整字体」)。
// 两行共用的排版参数 —— 关键: 字号由【两行里最长的金额】统一决定,
// 否则 Scriptable 的 minimumScaleFactor 会把较长的那行单独缩小, 两行看起来字体不一致。
function statMetrics(compact, amounts) {
  const box = compact ? 96 : 110;
  const fsMax = compact ? 10 : 12;
  const longest = Math.max.apply(null, amounts.map((a) => String(a).length).concat([1]));
  const fit = Math.floor((box - 4) / (0.58 * longest));   // 系统字体数字宽≈0.58em
  return { box: box, labW: compact ? 48 : 56, pctW: compact ? 54 : 62, msf: 0.85,
           fs: Math.max(compact ? 8 : 9, Math.min(fsMax, fit)), longest: longest };
}

function statRow(w, label, pnl, pct, p, M) {
  const fs = M.fs, box = M.box;
  const row = w.addStack();
  row.layoutHorizontally();

  const lab = row.addStack();                       // 定宽容器: 标签列
  lab.size = new Size(M.labW, 0);
  const lt = lab.addText(label);
  lt.font = Font.systemFont(fs);
  lt.textColor = p.dim;
  lt.lineLimit = 1;

  const amtBox = row.addStack();                    // 定宽容器: 金额列
  amtBox.size = new Size(box, 0);
  const amt = amtBox.addText(hk(pnl, true));
  amt.font = Font.semiboldSystemFont(fs);
  amt.textColor = sigColor(pnl);
  amt.lineLimit = 1;
  amt.minimumScaleFactor = M.msf;                   // 两行同值

  row.addSpacer();
  const pcBox = row.addStack();                     // 定宽容器: 百分比列(两行右缘对齐)
  pcBox.size = new Size(M.pctW, 0);
  if (pct === null || pct === undefined) return row;   // 允许留空(仅保留等宽列, 几何不变)
  const pc = pcBox.addText(arrow(pct) + Math.abs(pct).toFixed(2) + "%");
  pc.font = Font.systemFont(fs);
  pc.textColor = sigColor(pct);
  pc.lineLimit = 1;
  pc.minimumScaleFactor = M.msf;
  return row;
}

// ── 涨跌胶囊 (原生观感) ──────────────────────────────────────
function addChip(parent, v, p, small) {
  const c = parent.addStack();
  c.layoutHorizontally();
  c.cornerRadius = small ? 5 : 7;
  c.backgroundColor = tint(v, 0.24);
  c.setPadding(small ? 2 : 3, small ? 6 : 8, small ? 2 : 3, small ? 6 : 8);
  const t = c.addText(arrow(v) + Math.abs(v).toFixed(2) + "%");
  t.font = Font.semiboldSystemFont(small ? 10 : 12);
  t.textColor = sigColor(v);
  t.lineLimit = 1;
  return c;
}

// ── 收益率迷你折线 ───────────────────────────────────────────
function sparkline(series, w, h, p) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  if (!series || series.length < 2) return null;

  const min = Math.min(...series), max = Math.max(...series);
  const span = (max - min) || 1;
  const pad = h * 0.17;   // 折线整体上提, 不贴底边缘/圆角
  const X = (i) => (i / (series.length - 1)) * (w - 4) + 2;   // 两端各留 2pt, 终点圆点不贴边
  const Y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);

  // 零轴 (仅当区间跨 0)
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

  // 面积填充: DrawContext 没有渐变 API, 用同色 0.13 透明度填充(原生"面积图"观感)
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

  // 末端圆点
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
  t.minimumScaleFactor = 0.75;               // 标题行越来越挤, 允许缩一点防裁切
  return t;
}

// ── 组件主体 ─────────────────────────────────────────────────
async function build() {
  const p = palette();
  const w = new ListWidget();
  const bgGrad = new LinearGradient();               // 原生观感: 极淡的上下渐变
  bgGrad.colors = [p.bgTop, p.bg];
  bgGrad.locations = [0, 1];
  w.backgroundGradient = bgGrad;
  w.url = SITE_URL;                                  // ← 点组件直接开网站
  w.setPadding(15, 18, 15, 18);      // 内容往里收(此前 12/14 贴边)
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);  // 给 iOS 的"最早可刷新"提示(实际由 iOS 决定, 通常 15-30 分钟)

  const s = await loadData();
  if (!s) {
    const t = w.addText("读不到数据\n(网络?)");
    t.font = Font.systemFont(12);
    t.textColor = p.dim;
    return w;
  }

  const fam = config.widgetFamily || "medium";
  const small = fam === "small";
  const large = fam === "large";
  const ns = (s.nav_series || []).slice(-DAYS);
  const rets = ns.map((x) => Number(x.ret) || 0);
  const nav = Number(s.nav_hkd) || 0;
  const pnl = nav - (Number(s.cost_basis_hkd) || 750000);
  const ret = (pnl / (Number(s.cost_basis_hkd) || 750000)) * 100;

  // 标题行
  const head = w.addStack();
  head.layoutHorizontally();
  const ex0 = Number(s.exposure_hkd) || 0;
  const exTxt = "总敞口 " + hkShort(ex0);          // 用户: 不要后面的倍数
  if (!small) {                                     // 小尺寸太窄, 让位给敞口
    const title = head.addText("Oranger Portfolio");
    title.font = Font.semiboldSystemFont(10);
    title.textColor = p.dim;
    title.lineLimit = 1;
  }
  head.addSpacer();
  if (ex0 && !large) tinyLabel(head, exTxt, p.dim, small ? 8 : 9);   // 用户: 总敞口用小字即可(大尺寸下方块里已有)
  head.addSpacer(8);
  tinyLabel(head, (s.generated_at || "").slice(11, 16), p.dim, small ? 8 : 9);   // 用户: 要放更新时间
  w.addSpacer(small ? 4 : 6);

  // 净资产 (+ 当日涨跌胶囊: 中/大尺寸并排, 小尺寸移到下一行)
  const ds0 = dayStats(s);
  const navRow = w.addStack();
  navRow.layoutHorizontally();
  navRow.centerAlignContent();
  const navT = navRow.addText(hk(nav, false));
  navT.font = Font.semiboldSystemFont(small ? 24 : (large ? 38 : 30));   // 中号 30pt: 给折线留高度
  navT.textColor = p.fg;
  navT.minimumScaleFactor = 0.6;
  navT.lineLimit = 1;
  if (ds0 && !small) { navRow.addSpacer(10); addChip(navRow, ds0.pct, p, small); }
  if (ds0 && small) {
    w.addSpacer(3);
    const chipRow = w.addStack();
    chipRow.layoutHorizontally();
    addChip(chipRow, ds0.pct, p, small);
    chipRow.addSpacer();
  }
  w.addSpacer(small ? 6 : 9);             // NAV 与下面两行之间留白

  // 今日 / 总计 —— 两行共用 statRow, 字体与列宽一致; 中间留白不贴紧
  const ds = dayStats(s);
  const M = statMetrics(small, [hk(ds ? ds.pnl : 0, true), hk(pnl, true)]);
  if (ds) {
    statRow(w, "Today", ds.pnl, ds.pct, p, M);
    w.addSpacer(small ? 6 : 8);
  }
  statRow(w, "Total", pnl, ret, p, M);

  if (small) return w;

  w.addSpacer(5);

  // 折线区 (收益率)
  const chartH = large ? 96 : 24;   // 中号只够一条细火花线(高度预算: 170pt 卡片)
  const img = sparkline(rets, 300, chartH, p);
  if (img) {
    const i = w.addImage(img);
    i.imageSize = new Size(300, chartH);
    i.resizable = true;
  }

  // (底部「收益率 N 日 x%~y%」那行按用户要求删除, 腾出的高度给折线图)

  if (large) {
    w.addSpacer(6);
    const extra = w.addStack();
    extra.layoutHorizontally();
    const ex = (k, v) => {
      const st = extra.addStack();
      st.layoutVertically();
      tinyLabel(st, k, p.dim, 8);
      const t = st.addText(v);
      t.font = Font.semiboldSystemFont(11);
      t.textColor = p.fg;
      extra.addSpacer();
    };
    ex("总敞口", "HK$" + Math.round((Number(s.exposure_hkd) || 0) / 1000) + "k");
    ex("杠杆", (Number(s.leverage) || 0).toFixed(2) + "x");
    ex("现金", "HK$" + Math.round((Number(s.cash_hkd) || 0) / 1000) + "k");
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
