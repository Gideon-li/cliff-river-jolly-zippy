/**
 * 腾讯云短信。按产品要求先暂停，登录页只用手机号+密码。
 * 以后要恢复，把 SMS_ENABLED 改为 true，并配齐 SecretId / SecretKey / SdkAppId / 签名 / 模板 ID。
 */
const SMS_ENABLED = false;

export function smsReady() {
  return SMS_ENABLED;
}

export async function sendLoginCodeSms(_phone: string, _code: string) {
  throw new Error("短信已暂停，请用密码注册，或用微信进入");
}
