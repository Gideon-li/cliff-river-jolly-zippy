import { connect } from "node:tls";

const SMTP_HOST = "smtp.qq.com";
const SMTP_PORT = 465;
const SMTP_USER = "divination558@foxmail.com";
const SMTP_PASS = "pfvwsbznxxijeadg";
const SMTP_FROM = "问象 <divination558@foxmail.com>";

type Probe = { ok: boolean; reason: string; at: number };
let probe: Probe | null = null;
const PROBE_TTL_MS = 10 * 60 * 1000;

function encodeAuth(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

function completeReply(buf: string) {
  const lines = buf.replace(/\r/g, "").split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return /^\d{3} /.test(last) ? last : null;
}

async function smtpSession(sendMail?: { to: string; subject: string; text: string }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(
      { host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, timeout: 6000 },
      () => undefined,
    );
    let settled = false;
    const timer = setTimeout(() => fail(new Error("发信超时")), 8000);
    let buf = "";
    let step = 0;
    const lines = sendMail
      ? [
          `EHLO wenxiang`,
          `AUTH LOGIN`,
          encodeAuth(SMTP_USER),
          encodeAuth(SMTP_PASS),
          `MAIL FROM:<${SMTP_USER}>`,
          `RCPT TO:<${sendMail.to}>`,
          `DATA`,
          [
            `From: ${SMTP_FROM}`,
            `To: ${sendMail.to}`,
            `Subject: =?UTF-8?B?${Buffer.from(sendMail.subject).toString("base64")}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: text/plain; charset=UTF-8`,
            `Content-Transfer-Encoding: 8bit`,
            ``,
            sendMail.text,
            `.`,
          ].join("\r\n"),
          `QUIT`,
        ]
      : [`EHLO wenxiang`, `AUTH LOGIN`, encodeAuth(SMTP_USER), encodeAuth(SMTP_PASS), `QUIT`];

    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve();
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    socket.setEncoding("utf8");
    socket.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
    socket.on("timeout", () => fail(new Error("发信超时")));
    socket.on("close", () => {
      if (!settled) fail(new Error("QQ 邮箱拒绝登录"));
    });
    socket.on("data", (chunk: string) => {
      buf += chunk;
      const last = completeReply(buf);
      if (!last) return;
      buf = "";
      const code = Number(last.slice(0, 3));
      if (step === 0) {
        if (code !== 220) return fail(new Error("邮箱服务不可用"));
      } else if (code >= 400) {
        return fail(step < 5 ? new Error("QQ 邮箱拒绝登录") : new Error("验证码没有发出"));
      }
      if (step >= lines.length) return done();
      const next = lines[step]!;
      step += 1;
      socket.write(`${next}\r\n`);
      if (next === "QUIT") done();
    });
  });
}

export function smtpStatus(): { ok: boolean; reason: string } {
  if (probe) return { ok: probe.ok, reason: probe.reason };
  void smtpReady();
  return { ok: false, reason: "正在检测邮箱发信" };
}

export async function smtpReady(): Promise<{ ok: boolean; reason: string }> {
  if (probe && Date.now() - probe.at < PROBE_TTL_MS) return { ok: probe.ok, reason: probe.reason };
  try {
    await smtpSession();
    probe = { ok: true, reason: "", at: Date.now() };
    return probe;
  } catch (err) {
    probe = {
      ok: false,
      reason: err instanceof Error ? err.message : "邮箱发信不可用",
      at: Date.now(),
    };
    return probe;
  }
}

export async function sendLoginCodeEmail(to: string, code: string) {
  const ready = await smtpReady();
  if (!ready.ok) throw new Error(ready.reason || "邮箱发信不可用");
  await smtpSession({
    to,
    subject: "问象登录验证码",
    text: `您的问象验证码是 ${code}，5 分钟内有效。未操作请忽略。`,
  });
}
