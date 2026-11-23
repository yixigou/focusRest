/* =============================================================
 * FocusRest 官网多语言机制（与 App 内 L10n.swift 同一套设计）：
 * - 语言集合与 App 对齐：zh-Hans / zh-Hant / en / ja / ko / de / es；
 * - 以简体中文原文作键（短文案用空 data-i18n 自动取元素文本，
 *   长段落用显式短键），缺译运行时回退中文原文；
 * - 优先级：URL ?lang= > localStorage 上次选择 > 浏览器系统语言 > 简体；
 * - 截图只有 cn、en 两套：简体中文显示 cn 图，其余语言显示 en 图，
 *   可见性由 data-lang-img + i18n.css 依据 html[lang] 处理，不经过字典。
 * ============================================================= */
(function () {
  var LANGS = [
    { code: "zh-Hans", name: "简体中文" },
    { code: "zh-Hant", name: "繁體中文" },
    { code: "en",      name: "English"  },
    { code: "ja",      name: "日本語"   },
    { code: "ko",      name: "한국어"   },
    { code: "de",      name: "Deutsch"  },
    { code: "es",      name: "Español"  }
  ];
  var STORE_KEY = "focusrest-site-lang";
  var dicts = {};       // code -> {key: value}
  var entries = [];     // 收集到的可翻译节点
  var titleEntry = null;
  var descEntry = null;
  var current = "zh-Hans";

  // 把 zh / zh_TW / zh-Hant-TW / EN … 归一到受支持的语言代码；不识别返回 null
  function normalize(input) {
    if (!input) return null;
    var l = String(input).replace(/_/g, "-").toLowerCase();
    for (var i = 0; i < LANGS.length; i++) {
      if (l === LANGS[i].code.toLowerCase()) return LANGS[i].code;
    }
    if (l.indexOf("zh") === 0) {
      return /hant|tw|hk|mo/.test(l) ? "zh-Hant" : "zh-Hans";
    }
    var rest = ["en", "ja", "ko", "de", "es"];
    for (var j = 0; j < rest.length; j++) {
      if (l === rest[j] || l.indexOf(rest[j] + "-") === 0) return rest[j];
    }
    return null;
  }

  // 按浏览器偏好列表逐个匹配；全不在支持列表时落英文（与国际版一致）
  function detectBrowser() {
    var list = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < list.length; i++) {
      var hit = normalize(list[i]);
      if (hit) return hit;
    }
    return "en";
  }

  function pickInitial() {
    var q = normalize((location.search.match(/[?&]lang=([a-zA-Z_-]+)/) || [])[1]);
    if (q) return q;
    var stored = null;
    try { stored = normalize(localStorage.getItem(STORE_KEY)); } catch (e) {}
    if (stored) return stored;
    return detectBrowser();
  }

  // HTML 源码里的长文案可能跨行缩进，键统一折叠空白后再匹配
  function collapse(s) { return String(s).replace(/\s+/g, " ").trim(); }

  function collect() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      var k = el.getAttribute("data-i18n") || collapse(el.textContent);
      entries.push({ el: el, key: k, orig: el.textContent, mode: "text" });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-html]"), function (el) {
      entries.push({ el: el, key: collapse(el.getAttribute("data-i18n-html")), orig: el.innerHTML, mode: "html" });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-alt]"), function (el) {
      var k = el.getAttribute("data-i18n-alt") || collapse(el.getAttribute("alt") || "");
      entries.push({ el: el, key: k, orig: el.getAttribute("alt") || "", mode: "alt" });
    });
    titleEntry = { key: collapse(document.title), orig: document.title };
    var d = document.querySelector('meta[name="description"]');
    if (d) {
      descEntry = { el: d, key: collapse(d.getAttribute("content") || ""), orig: d.getAttribute("content") || "" };
    }
  }

  function tr(key) {
    var d = dicts[current];
    if (d && Object.prototype.hasOwnProperty.call(d, key) && d[key]) return d[key];
    return null;
  }

  var booted = false;
  var box = null;
  function buildSwitch() {
    box = document.getElementById("langSwitch");
    if (!box) return;
    var caret = '<svg class="lang-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>';
    box.innerHTML =
      '<button type="button" class="lang-btn" aria-haspopup="listbox" aria-expanded="false"><span></span>' + caret + "</button>" +
      '<ul class="lang-menu" role="listbox">' +
      LANGS.map(function (x) {
        return '<li role="option"><button type="button" data-code="' + x.code + '">' + x.name + "</button></li>";
      }).join("") +
      "</ul>";
    var btn = box.querySelector(".lang-btn");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = box.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    box.querySelector(".lang-menu").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-code]") : null;
      if (b) setLang(b.getAttribute("data-code"));
    });
    document.addEventListener("click", function (e) {
      if (!box.contains(e.target)) closeSwitch();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSwitch();
    });
  }
  function closeSwitch() {
    if (!box) return;
    box.classList.remove("open");
    box.querySelector(".lang-btn").setAttribute("aria-expanded", "false");
  }
  function updateSwitch() {
    if (!box) return;
    closeSwitch();
    var label = box.querySelector(".lang-btn > span");
    LANGS.forEach(function (x) { if (x.code === current) label.textContent = x.name; });
    Array.prototype.forEach.call(box.querySelectorAll(".lang-menu button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-code") === current);
    });
  }

  function apply() {
    document.documentElement.lang = current;
    entries.forEach(function (n) {
      var v = tr(n.key);
      if (n.mode === "alt") n.el.setAttribute("alt", v || n.orig);
      else if (n.mode === "html") n.el.innerHTML = v || n.orig;
      else n.el.textContent = v || n.orig;
    });
    if (descEntry) descEntry.el.setAttribute("content", tr(descEntry.key) || descEntry.orig);
    document.title = tr(titleEntry.key) || titleEntry.orig;
    try { localStorage.setItem(STORE_KEY, current); } catch (e) {}
    updateSwitch();
  }

  function setLang(code) {
    var c = normalize(code);
    if (!c) return;
    current = c;
    apply();
  }

  window.I18N = {
    // 语言文件在 i18n.js 之后加载；register 只入库，统一等 DOMContentLoaded 再应用
    register: function (code, dict) {
      var c = normalize(code);
      if (!c) return;
      var d = dicts[c] || (dicts[c] = {});
      Object.keys(dict).forEach(function (k) { d[collapse(k)] = dict[k]; });
      // 字典文件在本脚本之后加载；若 boot 已跑完（文档 readyState 非 loading 的同步加载场景），
      // 当前语言的字典晚到就重新应用一次，保证不依赖脚本执行时序
      if (booted && c === current) apply();
    },
    set: setLang
  };

  function boot() {
    booted = true;
    collect();
    current = pickInitial();
    buildSwitch();
    apply();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
