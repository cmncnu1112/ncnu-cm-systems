/**
 * ============================================================
 * admin-sso.js：管院後台「一次登入、全部通行」前端元件
 * ============================================================
 * 原理：
 *   1. 所有系統都在同一個 GitHub Pages 網域，localStorage 互相共用。
 *   2. 任何一個後台登入成功，共用通行證存進 localStorage「cmAdminSsoToken」。
 *   3. 打開其他系統的後台時，本檔在頁面程式執行前，把共用通行證放進該頁面
 *      原本存通行證的位置（sessionStorage），頁面就會直接以登入狀態開啟。
 *   4. 各頁面原本的登入、登出呼叫，透過 gas-shim.js 的 gasRoutes 改送到登入中心。
 *
 * 使用方式（放在後台頁面 <head>，gas-shim.js 之後、頁面程式之前）：
 *   <script>window.CM_ADMIN = { tokenKey:'頁面通行證鍵名', loginFn:'頁面登入函式', logoutFn:'頁面登出函式' };</script>
 *   <script src="../shared/sso-config.js?v=1"></script>
 *   <script src="../shared/admin-sso.js?v=1"></script>
 *
 * 選用設定：CM_ADMIN.identityKey、CM_ADMIN.identityValue
 *   打卡後台會把登入者顯示名稱存在 localStorage，這裡一併帶入。
 * ============================================================
 */
(function () {
  'use strict';

  var SSO_KEY = 'cmAdminSsoToken';   // localStorage：共用通行證
  var cfg = window.CM_ADMIN || {};
  if (!cfg.tokenKey || !window.CM_SSO_URL) {
    console.warn('[admin-sso] 缺少 CM_ADMIN.tokenKey 或 CM_SSO_URL，共用登入未啟用。');
    return;
  }

  /** 解析通行證內容（只用來判斷是否過期；真正的驗證在後端） */
  function readPayload(token) {
    try {
      var b64 = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (e) { return null; }
  }

  /** 讀取仍在有效期限內的共用通行證；過期就順手清掉 */
  function validSsoToken() {
    var t = '';
    try { t = localStorage.getItem(SSO_KEY) || ''; } catch (e) { return ''; }
    if (!t) return '';
    var p = readPayload(t);
    if (!p || !p.exp || Date.now() > Number(p.exp) - 60000) {   // 剩不到 1 分鐘視為過期
      try { localStorage.removeItem(SSO_KEY); } catch (e) {}
      return '';
    }
    return t;
  }

  function saveSso(t) { try { t ? localStorage.setItem(SSO_KEY, t) : localStorage.removeItem(SSO_KEY); } catch (e) {} }

  // ---------- 1. 頁面開啟前：把共用通行證放進頁面原本的位置 ----------
  var token = validSsoToken();
  if (token) {
    try { sessionStorage.setItem(cfg.tokenKey, token); } catch (e) {}
    if (cfg.identityKey && cfg.identityValue) {
      try { localStorage.setItem(cfg.identityKey, JSON.stringify(cfg.identityValue)); } catch (e) {}
    }
  }

  // ---------- 2. 登入、登出改送到登入中心 ----------
  window.gasRoutes = window.gasRoutes || {};
  if (cfg.loginFn) {
    window.gasRoutes[cfg.loginFn] = {
      url: window.CM_SSO_URL,
      fn: 'ssoLogin',
      onData: function (data) {
        var t = data && (data.token || (data.data && data.data.token));
        if (t) saveSso(t);   // 登入成功：存成共用通行證，其他系統也能用
      }
    };
  }
  if (cfg.logoutFn) {
    window.gasRoutes[cfg.logoutFn] = {
      url: window.CM_SSO_URL,
      fn: 'ssoLogout',
      onCall: function () { saveSso(''); }   // 按下登出就先清除，不必等伺服器回應
    };
  }

  /** 提供給頁面或除錯使用：全部後台一起登出 */
  window.cmAdminSsoLogout = function () { saveSso(''); };
})();
