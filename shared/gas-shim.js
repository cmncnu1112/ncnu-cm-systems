/**
 * ============================================================
 * gas-shim.js：google.script.run 相容層（管院行政系統共用）
 * ============================================================
 *
 * 【用途】
 *   讓原本寫給 GAS HtmlService 的前端頁面，幾乎不改程式就能放在
 *   GitHub Pages 上執行，解決 Android 手機透過 LINE LIFF 開啟 GAS
 *   網頁時出現「很抱歉，目前無法開啟這個檔案」的問題。
 *
 * 【原理】
 *   攔截 google.script.run.函式名稱(參數) 的呼叫，改用 fetch 送到
 *   GAS 的 doPost，由 doPost 轉交給原本的後端函式執行。
 *
 * 【交接注意】
 *   1. 這裡的 google.script.run 是「模擬」的，並非真正的 GAS 環境。
 *   2. 真正的後端入口在各系統 GAS 專案中的 gas-api.gs（doPost）。
 *   3. 前端新增一個後端呼叫時，必須同步把函式名稱加入 GAS 端白名單。
 *
 * 【使用方式】在 HTML 的 <head> 中依序加入：
 *   <script>window.GAS_URL = '該系統 GAS 部署的 /exec 網址';</script>
 *   <script src="../shared/gas-shim.js"></script>
 *
 * 【已支援】
 *   google.script.run 的 withSuccessHandler / withFailureHandler /
 *   withUserObject、傳入 <form> 元素、google.script.url.getLocation、
 *   google.script.host.close（不做事）
 *
 * 【不支援】
 *   檔案上傳欄位（需改為先轉成 base64 字串再傳送）
 *
 * 【登入通行證（2026-11 新增，選用）】
 *   需要後台密碼的頁面可設定：
 *     window.gasAuthToken       字串或回傳字串的函式，會隨每次請求送到後端
 *     window.gasOnAuthRequired  後端回報 authRequired 時呼叫，用來顯示登入畫面
 *   沒設定這兩個變數的頁面，行為與舊版完全相同。
 * ============================================================
 */
(function () {
  'use strict';

  // 讀取各系統頁面事先設定的 GAS 網址
  var GAS_URL = window.GAS_URL;
  if (!GAS_URL) {
    console.error('[gas-shim] 尚未設定 window.GAS_URL，請在載入本檔案之前設定。');
  }

  // 單次請求的逾時時間（毫秒），GAS 冷啟動可能需要數秒，因此設定寬鬆
  var TIMEOUT_MS = 60000;

  /**
   * 將參數轉成可用 JSON 傳送的格式
   * 原生 google.script.run 允許直接傳 <form> 元素，這裡轉成一般物件
   * 同名欄位（例如多選核取方塊）會轉成陣列
   */
  function normalizeArg(arg) {
    if (typeof HTMLFormElement !== 'undefined' && arg instanceof HTMLFormElement) {
      var obj = {};
      new FormData(arg).forEach(function (value, key) {
        if (value instanceof File) {
          console.warn('[gas-shim] 表單欄位「' + key + '」為檔案，相容層不支援，已略過。');
          return;
        }
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // 已存在同名欄位：轉為陣列保存
          obj[key] = [].concat(obj[key], value);
        } else {
          obj[key] = value;
        }
      });
      return obj;
    }
    return arg;
  }

  /**
   * 取得登入通行證（需要後台密碼的系統才會設定）
   * 頁面可設定 window.gasAuthToken 為字串，或回傳字串的函式；沒設定時送出空字串
   */
  function currentToken() {
    var t = window.gasAuthToken;
    try { if (typeof t === 'function') t = t(); } catch (e) { t = ''; }
    return typeof t === 'string' ? t : '';
  }

  /**
   * 實際送出請求到 GAS doPost
   * 使用 text/plain 是為了避免瀏覽器發出 CORS 預檢（GAS 不處理 OPTIONS）
   */
  function callGas(fnName, args) {
    // 轉送設定：window.gasRoutes[函式名稱] = { url, fn, onCall, onData }
    // 用於把特定呼叫（例如後台登入）改送到其他 GAS 專案，並在成功後執行 onData
    var route = window.gasRoutes && window.gasRoutes[fnName];
    // 每次呼叫時重新讀取（config.js 載入順序或快取問題時，比較容易看出原因）
    var targetUrl = (route && route.url) || window.GAS_URL || GAS_URL;
    if (!targetUrl || !/^https:\/\/script\.google\.com\//.test(targetUrl)) {
      return Promise.reject(new Error('找不到後端網址：請確認同資料夾的 config.js 已上傳到 GitHub，且 GAS_URL 已填入 /exec 網址。'));
    }
    var targetFn = (route && route.fn) || fnName;
    if (route && typeof route.onCall === 'function') {
      try { route.onCall(args); } catch (e) {}
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: targetFn, args: args.map(normalizeArg), token: currentToken() }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error('伺服器回應錯誤（HTTP ' + res.status + '）');
        return res.text();
      })
      .then(function (text) {
        // GAS 發生配額或系統錯誤時會回傳 HTML，這裡統一轉成可讀訊息
        var result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          throw new Error('後端回傳格式錯誤，可能是 GAS 部署設定或配額問題。');
        }
        if (!result.ok) {
          // 後端回報需要登入：交給頁面的登入處理（有設定 window.gasOnAuthRequired 才會呼叫）
          if (result.authRequired && typeof window.gasOnAuthRequired === 'function') {
            try { window.gasOnAuthRequired(result.error); } catch (e) {}
          }
          throw new Error(result.error || '後端執行失敗');
        }
        if (route && typeof route.onData === 'function') {
          try { route.onData(result.data); } catch (e) {}
        }
        return result.data;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  /**
   * 建立可串接的呼叫器
   * 每次 withXxx() 都回傳新的呼叫器，行為與原生 API 相同
   */
  function createRunner(onSuccess, onFailure, userObject) {
    return new Proxy({}, {
      get: function (_, prop) {
        // 串接設定
        if (prop === 'withSuccessHandler') {
          return function (fn) { return createRunner(fn, onFailure, userObject); };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) { return createRunner(onSuccess, fn, userObject); };
        }
        if (prop === 'withUserObject') {
          return function (obj) { return createRunner(onSuccess, onFailure, obj); };
        }
        // 避免被誤當成 Promise 或被除錯工具探查時觸發請求
        if (typeof prop !== 'string' || prop === 'then') return undefined;

        // 其餘屬性一律視為後端函式名稱
        return function () {
          var args = Array.prototype.slice.call(arguments);
          callGas(prop, args)
            .then(function (data) {
              if (onSuccess) onSuccess(data, userObject);
            })
            .catch(function (err) {
              if (err && err.name === 'AbortError') err = new Error('連線逾時，請稍後再試。');
              if (onFailure) {
                onFailure(err, userObject);
              } else {
                console.error('[gas-shim] 呼叫 ' + prop + ' 失敗：', err);
              }
            });
        };
      }
    });
  }

  // ---------- 掛到全域，讓原本的程式碼無感使用 ----------
  window.google = window.google || {};
  window.google.script = window.google.script || {};

  // 模擬 google.script.run
  window.google.script.run = createRunner(null, null, undefined);

  // 模擬 google.script.url.getLocation（讀取網址參數）
  window.google.script.url = {
    getLocation: function (callback) {
      var params = new URLSearchParams(window.location.search);
      var parameter = {};
      var parameters = {};
      params.forEach(function (value, key) {
        if (!(key in parameter)) parameter[key] = value; // 單一值：取第一個
        (parameters[key] = parameters[key] || []).push(value); // 多值：全部保留
      });
      callback({
        hash: window.location.hash.replace(/^#/, ''),
        parameter: parameter,
        parameters: parameters
      });
    }
  };

  // 模擬 google.script.host（外部頁面沒有對話框可關閉，保留空函式避免報錯）
  window.google.script.host = {
    close: function () {},
    setHeight: function () {},
    setWidth: function () {}
  };
})();
