export function isWeChatUA() {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function isAlipayUA() {
  if (typeof navigator === "undefined") return false;
  return /AlipayClient/i.test(navigator.userAgent);
}

export function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function go(url: string) {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 2500);
}

export async function copyText(text: string) {
  if (typeof navigator === "undefined" || !text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Open the installed WeChat app (iOS / Android). No-op inside WeChat WebView. */
export function launchSystemWeChat(loginUrl?: string) {
  if (typeof window === "undefined" || isWeChatUA()) return;
  if (loginUrl) void copyText(loginUrl);
  go("weixin://");
  if (/Android/i.test(navigator.userAgent)) {
    window.setTimeout(() => {
      go("intent://dl/businessWebview/link#Intent;scheme=weixin;package=com.tencent.mm;end");
    }, 280);
  }
}

/** Jump to WeChat scan so the user can pay the on-page QR. */
export function launchWeChatScan() {
  if (typeof window === "undefined") return;
  if (isWeChatUA()) return;
  go("weixin://scanqrcode");
  window.setTimeout(() => go("weixin://dl/scan"), 280);
}

/** Jump to Alipay scan. */
export function launchAlipayScan() {
  if (typeof window === "undefined") return;
  if (isAlipayUA()) return;
  go("alipays://platformapi/startapp?saId=10000007");
  window.setTimeout(() => go("alipayqr://platformapi/startapp?saId=10000007"), 280);
}

export function wechatLoginUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin);
  url.pathname = "/login";
  url.search = "from=wechat";
  url.hash = "";
  return url.toString();
}
