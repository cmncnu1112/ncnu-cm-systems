/**
 * 電視牆跑馬燈申請系統 前台（GitHub Pages 版）：後端網址設定
 * ------------------------------------------------------------
 * 同資料夾的頁面會先載入本檔，再由 ../shared/gas-shim.js 把 google.script.run 轉成 fetch。
 * GAS_URL 是「電視牆跑馬燈申請系統 前台」GAS 專案既有部署的 /exec 網址。
 * 更新 GAS 程式時請「部署 → 管理部署作業 → 編輯 → 新版本」，網址才不會改變。
 * 後端只開放 gas-api.gs 白名單中的前台函式，後台仍用 GAS 原本網址開啟。
 */
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbz7bNL4Wl_HyXTaVoMdUrFW7zqO1V7nClpFPFKLCNsj9B9YR9ecVm7ITtdL8_kVBIfWdw/exec';
