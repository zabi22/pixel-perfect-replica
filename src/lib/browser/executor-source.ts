/**
 * The single browser executor, as plain JavaScript source.
 *
 * It is shipped verbatim to remote providers (e.g. Browserless /function, Puppeteer)
 * and evaluated in-process for Node providers (Playwright). It only uses the API
 * subset shared by Puppeteer and Playwright pages: goto, evaluate, mouse, keyboard,
 * screenshot, url and event listeners. It never executes user-supplied code: the
 * plan is JSON data validated by planSchema before it gets here.
 *
 * Signature: __dp_run(page, ctx, kind, hooks) -> { steps, consoleErrors, networkErrors, blocked, finalUrl }
 *   ctx   = { plan, baseUrl, allowedHosts, stepTimeoutMs, defaultStepTimeoutMs, budgetMs, destructiveRe }
 *   kind  = "puppeteer" | "playwright"
 *   hooks = { onStep(result), shouldStop() } | null
 */
export const EXECUTOR_CORE = `
async function __dp_run(page, ctx, kind, hooks) {
  var t0 = Date.now();
  var consoleErrors = [], networkErrors = [], blocked = [];
  var destructive = new RegExp(ctx.destructiveRe, "i");
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "..." : s; }
  function hostOk(u) {
    try {
      var x = new URL(u);
      if (x.protocol === "data:" || x.protocol === "blob:" || x.protocol === "about:") return true;
      if (x.protocol !== "http:" && x.protocol !== "https:") return false;
      var h = x.hostname.toLowerCase().replace(/\\.$/, "");
      if (h.indexOf(":") !== -1 || h.charAt(0) === "[" || /^[0-9.]+$/.test(h) || /^0x/i.test(h)) return false;
      if (h === "localhost" || /\\.(localhost|local|internal|lan)$/.test(h)) return false;
      if (x.port && ["80","443","8080","8443"].indexOf(x.port) === -1) return false;
      for (var i = 0; i < ctx.allowedHosts.length; i++) {
        var a = ctx.allowedHosts[i];
        if (h === a || h.slice(-(a.length + 1)) === "." + a) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // ---- request-level restrictions ----
  if (kind === "puppeteer") {
    await page.setRequestInterception(true);
    page.on("request", function (r) {
      if (r.isInterceptResolutionHandled && r.isInterceptResolutionHandled()) return;
      if (hostOk(r.url())) r.continue(); else { blocked.push(clip(r.url(), 200)); r.abort("blockedbyclient"); }
    });
    try { await page.setViewport({ width: 1280, height: 800 }); } catch (e) {}
  } else {
    await page.route("**/*", function (route) {
      var u = route.request().url();
      if (hostOk(u)) return route.continue();
      blocked.push(clip(u, 200)); return route.abort("blockedbyclient");
    });
  }
  page.on("console", function (m) { try { if (m.type() === "error") consoleErrors.push(clip(m.text(), 400)); } catch (e) {} });
  page.on("pageerror", function (e) { consoleErrors.push(clip("Uncaught: " + (e && e.message ? e.message : e), 400)); });
  page.on("requestfailed", function (r) {
    try { var f = r.failure(); var t = f ? f.errorText : "failed"; if (t.indexOf("BLOCKED_BY_CLIENT") === -1 && t !== "blockedbyclient") networkErrors.push(clip(t + " " + r.url(), 300)); } catch (e) {}
  });
  page.on("response", function (r) { try { if (r.status() >= 400) networkErrors.push(r.status() + " " + clip(r.url(), 250)); } catch (e) {} });

  // ---- in-page locator (serialised into the page; must be self-contained) ----
  function findInPage(t) {
    function norm(s) { return (s || "").replace(/\\s+/g, " ").trim().toLowerCase(); }
    function visible(el) {
      var r = el.getBoundingClientRect(); var s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
    }
    function accName(el) {
      var v = el.getAttribute("aria-label"); if (v) return v;
      var lb = el.getAttribute("aria-labelledby");
      if (lb) return lb.split(/\\s+/).map(function (i) { var e = document.getElementById(i); return e ? e.textContent : ""; }).join(" ");
      if (el.id) { var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lab) return lab.textContent; }
      var pl = el.closest("label"); if (pl) return pl.textContent;
      if (el.tagName === "INPUT" && /^(submit|button|reset)$/.test(el.type)) return el.value || el.type;
      return el.getAttribute("title") || el.textContent || el.getAttribute("alt") || el.getAttribute("placeholder") || "";
    }
    var roles = {
      button: "button,[role=button],input[type=submit],input[type=button],input[type=reset]",
      link: "a[href],[role=link]",
      textbox: "input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=url],input[type=search],input[type=password],input[type=number],textarea,[role=textbox],[contenteditable=true]",
      checkbox: "input[type=checkbox],[role=checkbox]",
      radio: "input[type=radio],[role=radio]",
      combobox: "select,[role=combobox]",
      heading: "h1,h2,h3,h4,h5,h6,[role=heading]"
    };
    var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var want = norm(t.by === "role" ? t.name : t.value);
    var cands = [], nameOf = accName;
    if (t.by === "role") cands = all(roles[t.role] || "[role=" + t.role + "]");
    else if (t.by === "label") cands = all("input,textarea,select,[role=textbox],[role=combobox],[contenteditable=true]");
    else if (t.by === "placeholder") { cands = all("[placeholder]"); nameOf = function (e) { return e.getAttribute("placeholder"); }; }
    else if (t.by === "testId") { cands = all('[data-testid="' + CSS.escape(t.value) + '"]'); nameOf = function () { return ""; }; want = ""; }
    else if (t.by === "text") {
      nameOf = function (e) { return e.innerText || e.textContent; };
      cands = all("body *").filter(function (e) {
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) return false;
        if (norm(e.innerText || e.textContent).indexOf(want) === -1) return false;
        for (var c = e.firstElementChild; c; c = c.nextElementSibling) if (norm(c.innerText || c.textContent).indexOf(want) !== -1) return false;
        return true;
      });
    }
    var matches = cands.filter(function (e) { return !want || norm(nameOf(e)).indexOf(want) !== -1; });
    var vis = matches.filter(visible);
    if (!vis.length) return { found: 0, hidden: matches.length };
    var exact = want ? vis.filter(function (e) { return norm(nameOf(e)) === want; }) : [];
    var pick = null;
    if (exact.length === 1) pick = exact[0];
    else if (exact.length > 1) return { found: exact.length, ambiguous: true };
    else if (vis.length === 1 || !want) pick = vis[0];
    else return { found: vis.length, ambiguous: true };
    pick.scrollIntoView({ block: "center", inline: "center" });
    var r = pick.getBoundingClientRect();
    all("[data-dp-target]").forEach(function (e) { e.removeAttribute("data-dp-target"); });
    pick.setAttribute("data-dp-target", "1");
    return {
      found: 1, x: r.left + r.width / 2, y: r.top + r.height / 2, tag: pick.tagName,
      disabled: !!pick.disabled || pick.getAttribute("aria-disabled") === "true",
      name: (accName(pick) || "").replace(/\\s+/g, " ").trim().slice(0, 120)
    };
  }

  async function locate(target, deadline) {
    var last = { found: 0 };
    while (true) {
      try { last = await page.evaluate(findInPage, target); } catch (e) { last = { found: 0, err: String(e && e.message || e) }; }
      if (last.found === 1) return last;
      if (Date.now() >= deadline) return last;
      await sleep(250);
    }
  }
  function describeTarget(t) {
    if (t.by === "role") return t.role + (t.name ? ' "' + t.name + '"' : "");
    return t.by + ' "' + t.value + '"';
  }
  async function bodyText() {
    try { return await page.evaluate(function () { return document.body ? document.body.innerText : ""; }); } catch (e) { return ""; }
  }
  async function shot() {
    try {
      if (kind === "puppeteer") return await page.screenshot({ type: "jpeg", quality: 55, encoding: "base64" });
      var b = await page.screenshot({ type: "jpeg", quality: 55 }); return b.toString("base64");
    } catch (e) { return null; }
  }
  function normText(s) { return String(s || "").replace(/\\s+/g, " ").trim().toLowerCase(); }

  async function runStep(s, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    var expected = "", observed = "", code = null;
    if (s.action === "goto") {
      var u = new URL(s.path || "/", ctx.baseUrl).toString();
      expected = "Page " + u + " loads";
      if (!hostOk(u)) return { code: "policy_blocked", expected: expected, observed: "Destination not allowed by security policy" };
      try {
        var resp = await page.goto(u, { timeout: timeoutMs, waitUntil: "load" });
        var st = resp ? resp.status() : 0;
        if (st >= 400) return { code: "http_error", expected: expected, observed: "Server responded HTTP " + st };
        return { code: null, expected: expected, observed: "Loaded " + page.url() + (st ? " (HTTP " + st + ")" : "") };
      } catch (e) {
        var msg = String(e && e.message || e);
        if (/timeout/i.test(msg)) return { code: "nav_timeout", expected: expected, observed: "Page did not finish loading within " + timeoutMs + "ms" };
        if (/BLOCKED_BY_CLIENT|blockedbyclient/i.test(msg)) return { code: "policy_blocked", expected: expected, observed: "Navigation was redirected to a destination blocked by security policy" };
        return { code: "nav_error", expected: expected, observed: "Navigation failed: " + clip(msg.split("\\n")[0], 200) };
      }
    }
    if (s.action === "press") {
      await page.keyboard.press(s.key); await sleep(300);
      return { code: null, expected: "Press " + s.key, observed: "Pressed " + s.key };
    }
    if (s.action === "assertText" || s.action === "assertNoText") {
      var want = normText(s.text), neg = s.action === "assertNoText";
      expected = neg ? 'Text "' + s.text + '" is not visible' : 'Text "' + s.text + '" is visible';
      var txt = "";
      while (true) {
        txt = await bodyText();
        var has = normText(txt).indexOf(want) !== -1;
        if (has !== neg) return { code: null, expected: expected, observed: neg ? "Text not present" : 'Found "' + s.text + '" on ' + page.url() };
        if (neg || Date.now() >= deadline) break;
        await sleep(300);
      }
      return { code: "assertion_failed", expected: expected,
        observed: neg ? 'Text "' + s.text + '" is present on the page' : 'Text not found within ' + timeoutMs + 'ms. Page text starts: "' + clip(normText(txt), 240) + '"' };
    }
    if (s.action === "assertUrl") {
      expected = 'URL contains "' + s.contains + '"';
      while (true) {
        if (page.url().indexOf(s.contains) !== -1) return { code: null, expected: expected, observed: "URL is " + page.url() };
        if (Date.now() >= deadline) return { code: "url_mismatch", expected: expected, observed: "URL is " + page.url() };
        await sleep(250);
      }
    }
    // element-based actions
    var label = describeTarget(s.target);
    var el = await locate(s.target, deadline);
    if (el.found !== 1) {
      var obs = null;
      try { obs = await page.evaluate(observePage, s.target); } catch (e) { obs = { error: clip(String(e && e.message || e), 200) }; }
      if (el.ambiguous) return { code: "element_ambiguous", expected: label + " is a single element", observed: el.found + " visible elements match " + label + ". No element was clicked; choose a more specific target.", observation: obs };
      var extra = "";
      if (obs && obs.textMentions === 0) extra = ' The text "' + clip(obs.want, 60) + '" does not appear anywhere in the page text.';
      else if (obs && obs.textMentions > 0) extra = ' The text appears ' + obs.textMentions + ' time(s) in the page, but not as a visible ' + (s.target.role || "matching element") + '.';
      if (obs && obs.collapsedMenus && obs.collapsedMenus.length) extra += " Collapsed menu control(s) present: " + obs.collapsedMenus.map(function (m) { return '"' + m + '"'; }).join(", ") + ".";
      return { code: "element_not_found", expected: label + " is visible",
        observed: (el.hidden ? label + " exists but is hidden (" + el.hidden + " match)." : "No element matching " + label + " appeared within " + timeoutMs + "ms.") + extra,
        observation: obs };
    }
    if (s.action === "waitFor" || s.action === "assertVisible") return { code: null, expected: label + " is visible", observed: "Found " + el.tag.toLowerCase() + (el.name ? ' "' + clip(el.name, 60) + '"' : "") };
    if (el.disabled) return { code: "element_disabled", expected: label + " is enabled", observed: label + " is disabled" };
    if (s.action === "click") {
      if (destructive.test(el.name)) return { code: "policy_blocked", expected: "Click " + label, observed: 'Refused to click "' + clip(el.name, 60) + '": looks like a purchase or destructive action' };
      var before = page.url();
      await page.mouse.click(el.x, el.y);
      await sleep(600);
      return { code: null, expected: "Click " + label, observed: "Clicked " + el.tag.toLowerCase() + (el.name ? ' "' + clip(el.name, 60) + '"' : "") + (page.url() !== before ? "; navigated to " + page.url() : "") };
    }
    if (s.action === "fill") {
      await page.evaluate(function () {
        var e = document.querySelector("[data-dp-target]"); if (!e) return;
        e.focus(); if ("value" in e) { e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); } else { e.textContent = ""; }
      });
      await page.keyboard.type(s.value, { delay: 5 });
      var val = await page.evaluate(function () { var e = document.querySelector("[data-dp-target]"); return e ? ("value" in e ? e.value : e.textContent) : null; });
      if (val !== s.value) return { code: "element_not_editable", expected: label + ' contains "' + s.value + '"', observed: "Field value is " + JSON.stringify(val) };
      return { code: null, expected: "Fill " + label, observed: "Typed " + s.value.length + " characters into " + el.tag.toLowerCase() };
    }
    if (s.action === "select") {
      var res = await page.evaluate(function (opt) {
        var e = document.querySelector("[data-dp-target]"); if (!e || e.tagName !== "SELECT") return "not_select";
        var o = Array.prototype.slice.call(e.options).find(function (x) { return x.label.trim().toLowerCase() === opt.toLowerCase() || x.value === opt; });
        if (!o) return "missing:" + Array.prototype.slice.call(e.options).map(function (x) { return x.label.trim(); }).slice(0, 15).join(" | ");
        e.value = o.value; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return "ok";
      }, s.option);
      if (res === "ok") return { code: null, expected: 'Select "' + s.option + '"', observed: 'Selected "' + s.option + '"' };
      if (res === "not_select") return { code: "element_not_editable", expected: label + " is a select box", observed: "Target is not a <select>" };
      return { code: "option_not_found", expected: 'Option "' + s.option + '" exists', observed: "Available options: " + res.slice(8) };
    }
    return { code: "unsupported_action", expected: s.action, observed: "Unsupported action" };
  }

  var results = [];
  for (var i = 0; i < ctx.plan.length; i++) {
    var s = ctx.plan[i];
    var started = Date.now();
    var r;
    if (hooks && hooks.shouldStop && (await hooks.shouldStop())) { r = { code: "cancelled", expected: "", observed: "Run cancelled by user before this step" }; }
    else if (started - t0 > ctx.budgetMs) { r = { code: "budget_exceeded", expected: "", observed: "Run time budget (" + ctx.budgetMs + "ms) exhausted before this step" }; }
    else {
      var tmo = Math.min(s.timeoutMs || ctx.defaultStepTimeoutMs, ctx.stepTimeoutMs, Math.max(500, ctx.budgetMs - (started - t0)));
      var ce = consoleErrors.length, ne = networkErrors.length, be = blocked.length;
      try {
        r = await Promise.race([
          runStep(s, tmo),
          sleep(tmo + 5000).then(function () { return { code: "step_timeout", expected: "", observed: "Step exceeded hard timeout of " + (tmo + 5000) + "ms" }; })
        ]);
      } catch (e) {
        var m = String(e && e.message || e);
        r = { code: /Target closed|has been closed|disconnected|Session closed/i.test(m) ? "browser_disconnected" : "action_error", expected: "", observed: clip(m.split("\\n")[0], 300) };
      }
      r.consoleErrors = consoleErrors.slice(ce, ce + 20);
      r.networkErrors = networkErrors.slice(ne, ne + 20).concat(blocked.slice(be, be + 10).map(function (b) { return "BLOCKED by policy: " + b; }));
    }
    r.index = i;
    r.startedAt = new Date(started).toISOString();
    r.durationMs = Date.now() - started;
    try { r.url = page.url(); } catch (e) { r.url = null; }
    var isLast = i === ctx.plan.length - 1;
    var stop = r.code !== null && r.code !== undefined;
    if (r.code !== "cancelled" && r.code !== "budget_exceeded" && r.code !== "browser_disconnected" && (stop || isLast || s.action === "goto")) r.screenshot = await shot();
    results.push(r);
    if (hooks && hooks.onStep) await hooks.onStep(r);
    if (stop) break;
  }
  var finalUrl = null; try { finalUrl = page.url(); } catch (e) {}
  return { steps: results, consoleErrors: consoleErrors.slice(0, 50), networkErrors: networkErrors.slice(0, 50), blocked: blocked.slice(0, 50), finalUrl: finalUrl, durationMs: Date.now() - t0 };
}
`;

/** Module for Browserless /function (Puppeteer page). */
export const BROWSERLESS_FUNCTION_MODULE = `${EXECUTOR_CORE}
export default async function ({ page, context }) {
  const out = await __dp_run(page, context, "puppeteer", null);
  return { data: out, type: "application/json" };
}
`;
