/**
 * 教室鑰匙與設備登記V2 前台（GitHub Pages 版）：後端網址設定
 * ------------------------------------------------------------
 * index.html 會先載入本檔，再由 ../shared/gas-shim.js 把 google.script.run 轉成 fetch。
 * GAS_URL 是「教室鑰匙與設備登記V2」GAS 專案既有部署的 /exec 網址。
 * 更新 GAS 程式時請「部署 → 管理部署作業 → 編輯 → 新版本」，網址才不會改變。
 * 後端只開放 gas-api.gs 白名單中的前台函式，後台仍用 GAS 原本網址開啟。
 */
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbyACYeVNaD3IHt72UegKcd1OWEM9WTts6ZQMQwuxW9hLWWV1SW9Y4F8YwE_e_gJSaya/exec';
