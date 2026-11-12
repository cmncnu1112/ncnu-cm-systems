/**
 * ============================================================
 * sso-verify.gs：管院後台「一次登入、全部通行」驗證（各系統共用）
 * ============================================================
 * 放置方式：在電視牆、請購、打卡、排課四個 GAS 專案各新增一個 sso-verify.gs，
 *           內容完全相同，貼上本檔即可。
 *
 * 必要設定：專案設定 → 指令碼屬性 → CM_SSO_SECRET
 *           值必須與「管院後台登入中心」專案的 CM_SSO_SECRET 完全相同。
 *           沒有設定時本檔不會放行任何通行證，各系統仍可用原本的個別密碼登入。
 *
 * 通行證格式：「內容.簽章」
 *   內容 = base64url(JSON{ v, role, name, iat, exp })
 *   簽章 = base64url(HMAC-SHA256(內容, CM_SSO_SECRET))
 *   只有知道 CM_SSO_SECRET 的登入中心能簽出正確簽章，前端無法偽造。
 *
 * 讓所有人立刻登出：在登入中心執行 rotateSsoSecret()，
 *   再把新的 CM_SSO_SECRET 貼到四個系統（舊通行證會全部失效）。
 * ============================================================
 */

/**
 * 驗證共用管理員通行證
 * @param {string} token 前端送來的通行證
 * @return {Object|null} 有效時回傳內容 { role, name, iat, exp }，無效回傳 null
 */
function verifySsoToken_(token) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('CM_SSO_SECRET');
    if (!secret || !token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    // 1. 重新計算簽章並比對
    const expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(parts[0], secret, Utilities.Charset.UTF_8)
    );
    if (!ssoSafeEqual_(expected, parts[1])) return null;

    // 2. 解析內容並檢查角色與到期時間
    const payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8')
    );
    if (!payload || payload.role !== 'admin') return null;
    if (!payload.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/** 字串比對：逐字比完才回傳，避免從回應時間猜出簽章 */
function ssoSafeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
