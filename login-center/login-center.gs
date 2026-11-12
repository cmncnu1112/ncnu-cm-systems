/**
 * ============================================================
 * 管院後台登入中心  login-center.gs
 * ============================================================
 * 用途：管院各系統後台的「一次登入、全部通行」。
 *   在任何一個系統的後台輸入密碼，請求會送到這個專案驗證，
 *   成功後發一張簽名通行證，存在瀏覽器（GitHub Pages 同網域共用），
 *   電視牆、請購、打卡、排課的後台都認得這張通行證，不必再分別登入。
 *
 * 第一次設定（新建一個獨立的 Apps Script 專案，只放這個檔案）：
 *   1. 編輯器執行 setupSsoSecret()：會產生一組隨機金鑰並存到本專案指令碼屬性
 *      CM_SSO_SECRET，執行紀錄會印出金鑰內容。
 *   2. 把同一組 CM_SSO_SECRET 貼到四個系統專案的指令碼屬性。
 *   3. 本專案指令碼屬性新增 ADMIN_PASSWORD（後台總密碼，建議 12 碼以上）。
 *   4. 執行 checkLoginCenter() 確認設定。
 *   5. 部署 → 網頁應用程式：執行身分「我」、存取權「任何人」，
 *      把 /exec 網址填到 GitHub 的 shared/sso-config.js。
 *
 * 安全機制：
 *   ‧ 密碼以 SHA-256 雜湊比對；連續輸錯 5 次鎖定 10 分鐘。
 *   ‧ 通行證 12 小時後失效，到期需重新登入。
 *   ‧ 改密碼後要讓所有人立刻登出：執行 rotateSsoSecret()，
 *     再把新金鑰更新到四個系統（舊通行證全部失效）。
 * ============================================================
 */

const SSO = {
  PROP_PASSWORD: 'ADMIN_PASSWORD',  // 指令碼屬性：後台總密碼
  PROP_SECRET: 'CM_SSO_SECRET',     // 指令碼屬性：簽章金鑰（四個系統要相同）
  TTL_MS: 12 * 60 * 60 * 1000,      // 通行證有效 12 小時
  MAX_FAILS: 5,                     // 連續輸錯幾次就鎖定
  LOCK_SEC: 600,                    // 鎖定 10 分鐘
  DISPLAY_NAME: '管理員'            // 審核人欄位顯示名稱
};

/**
 * 接收 GitHub Pages 前端的登入、登出請求
 * 前端格式：{ fn: 'ssoLogin' | 'ssoLogout', args: [...] }
 */
function doPost(e) {
  let output;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.fn === 'ssoLogin') {
      output = { ok: true, data: ssoLogin_(req.args && req.args[0]) };
    } else if (req.fn === 'ssoLogout') {
      // 通行證存在瀏覽器，由前端清除；這裡只回覆成功，讓各系統原本的登出流程照常運作
      output = { ok: true, data: { ok: true, message: '已登出。' } };
    } else {
      throw new Error('不支援的操作');
    }
  } catch (err) {
    output = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

/** 直接開網址時顯示簡短說明（確認部署成功用） */
function doGet() {
  return ContentService.createTextOutput('管院後台登入中心運作中。');
}

/**
 * 登入：比對密碼，成功回傳通行證
 * 回傳格式同時相容四個系統原本的登入回應：
 *   電視牆、排課讀 res.token；請購讀 res.ok、res.token；打卡讀 x.ok、x.data.token、x.data.user
 */
function ssoLogin_(password) {
  const cache = CacheService.getScriptCache();
  if (cache.get('SSO_LOCK')) throw new Error('密碼錯誤次數過多，已鎖定 10 分鐘，請稍後再試。');

  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty(SSO.PROP_PASSWORD);
  const secret = props.getProperty(SSO.PROP_SECRET);
  if (!expected || !secret) throw new Error('登入中心尚未設定完成，請管理者執行 checkLoginCenter() 檢查。');

  if (sha256Hex_(String(password || '')) !== sha256Hex_(expected)) {
    const fails = Number(cache.get('SSO_FAILS') || 0) + 1;
    if (fails >= SSO.MAX_FAILS) {
      cache.put('SSO_LOCK', '1', SSO.LOCK_SEC);
      cache.remove('SSO_FAILS');
      throw new Error('密碼錯誤次數過多，已鎖定 10 分鐘，請稍後再試。');
    }
    cache.put('SSO_FAILS', String(fails), SSO.LOCK_SEC);
    throw new Error('密碼錯誤，還可以再試 ' + (SSO.MAX_FAILS - fails) + ' 次。');
  }
  cache.remove('SSO_FAILS');

  // 簽發通行證
  const now = Date.now();
  const payload = { v: 1, role: 'admin', name: SSO.DISPLAY_NAME, iat: now, exp: now + SSO.TTL_MS };
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret, Utilities.Charset.UTF_8));
  const token = body + '.' + sig;
  const user = { name: SSO.DISPLAY_NAME, studentId: '', role: 'admin' };

  return { ok: true, token: token, message: '登入成功。', data: { token: token, user: user } };
}

/** SHA-256 雜湊成十六進位字串 */
function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** 產生隨機金鑰（64 個英數字） */
function newSecret_() {
  return (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 64);
}

/** 第一次設定：產生金鑰並存到本專案，執行紀錄會印出，請複製到四個系統 */
function setupSsoSecret() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(SSO.PROP_SECRET)) {
    console.log('已經有 CM_SSO_SECRET，不會覆蓋。目前的值：' + props.getProperty(SSO.PROP_SECRET));
    return;
  }
  const s = newSecret_();
  props.setProperty(SSO.PROP_SECRET, s);
  console.log('已建立 CM_SSO_SECRET，請把下面這串貼到四個系統的指令碼屬性 CM_SSO_SECRET：\n' + s);
}

/** 讓所有人立刻登出：換一組新金鑰（之後要把新金鑰更新到四個系統） */
function rotateSsoSecret() {
  const s = newSecret_();
  PropertiesService.getScriptProperties().setProperty(SSO.PROP_SECRET, s);
  console.log('已更換金鑰，舊通行證全部失效。請把新的 CM_SSO_SECRET 更新到四個系統：\n' + s);
}

/** 設定檢查 */
function checkLoginCenter() {
  const p = PropertiesService.getScriptProperties();
  console.log(p.getProperty(SSO.PROP_PASSWORD) ? '已設定 ADMIN_PASSWORD。' : '尚未設定 ADMIN_PASSWORD，請到指令碼屬性新增。');
  console.log(p.getProperty(SSO.PROP_SECRET) ? '已設定 CM_SSO_SECRET。' : '尚未設定 CM_SSO_SECRET，請執行 setupSsoSecret()。');
}
