import { createHash, createHmac } from "node:crypto";

/**
 * 腾讯云短信。真正发出去需要五样都齐：SecretId、SecretKey、SmsSdkAppId、已审核签名、验证码模板 ID。
 * 目前凭证不完整，登录页会改用手机号+密码注册。配齐后再填到下面即可发验证码。
 */
const SECRET_ID = "";
const SECRET_KEY = "";
const SDK_APP_ID = "";
const SIGN_NAME = "";
const TEMPLATE_ID = "";
const REGION = "ap-guangzhou";

export function smsReady() {
  return Boolean(SECRET_ID && SECRET_KEY && SDK_APP_ID && SIGN_NAME && TEMPLATE_ID);
}

function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function hmac(key: Buffer | string, s: string) {
  return createHmac("sha256", key).update(s).digest();
}

function tc3Headers(payload: string, action: string, timestamp: number) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonical =
    `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n\ncontent-type;host;x-tc-action\n${sha256Hex(payload)}`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/sms/tc3_request\n${sha256Hex(canonical)}`;
  const kDate = hmac(`TC3${SECRET_KEY}`, date);
  const kService = hmac(kDate, "sms");
  const kSigning = hmac(kService, "tc3_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${date}/sms/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
    "Content-Type": "application/json; charset=utf-8",
    Host: "sms.tencentcloudapi.com",
    "X-TC-Action": action,
    "X-TC-Version": "2021-01-11",
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Region": REGION,
  };
}

export async function sendLoginCodeSms(phone: string, code: string) {
  if (!smsReady()) throw new Error("短信还未开通，请用密码注册，或用微信进入");
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: SDK_APP_ID,
    SignName: SIGN_NAME,
    TemplateId: TEMPLATE_ID,
    TemplateParamSet: [code],
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const res = await fetch("https://sms.tencentcloudapi.com", {
    method: "POST",
    headers: tc3Headers(payload, "SendSms", timestamp),
    body: payload,
  });
  const json = (await res.json()) as {
    Response?: { Error?: { Message?: string }; SendStatusSet?: { Code?: string; Message?: string }[] };
  };
  const err = json.Response?.Error?.Message || json.Response?.SendStatusSet?.[0]?.Message;
  const ok = json.Response?.SendStatusSet?.[0]?.Code === "Ok";
  if (!ok) throw new Error(err || "短信没有发出");
}
