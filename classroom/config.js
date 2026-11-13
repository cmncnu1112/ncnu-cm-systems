/**
 * 教室排課系統V2 手機版查詢頁（GitHub Pages 版）：後端網址設定
 * ------------------------------------------------------------
 * 同資料夾的頁面會先載入本檔，再由 ../shared/gas-shim.js 把 google.script.run 轉成 fetch。
 * GAS_URL 是「教室排課系統V2 手機版查詢頁」GAS 專案既有部署的 /exec 網址。
 * 更新 GAS 程式時請「部署 → 管理部署作業 → 編輯 → 新版本」，網址才不會改變。
 * 後端只開放 gas-api.gs 白名單中的唯讀函式，管理端仍用 GAS 原本網址開啟。
 */
window.GAS_URL = 'https://script.google.com/macros/s/AKfycbxiYn6ijpuFwcPi8qwm8NLTl1hrIYLvELwiCMWMmyf1yD2Ghgpt3Ah-2qZkAFuGeMPi/exec';
