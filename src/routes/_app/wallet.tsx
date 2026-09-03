import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAY_SKUS, type PaySku } from "@/lib/app-types";
import { confirmPayment, createPayment, getWallet } from "@/lib/fn/billing";
import { copyText, isAlipayUA, isWeChatUA, launchAlipayScan, launchWeChatScan } from "@/lib/wechat";

export const Route = createFileRoute("/_app/wallet")({ component: WalletPage });

function WalletPage() {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof getWallet>> | null>(null);
  const [sku, setSku] = useState<PaySku>("credits_1");
  const [order, setOrder] = useState<Awaited<ReturnType<typeof createPayment>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [inWeChat, setInWeChat] = useState(false);
  const [inAlipay, setInAlipay] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reload() {
    const r = await getWallet();
    setWallet(r);
  }

  useEffect(() => {
    setInWeChat(isWeChatUA());
    setInAlipay(isAlipayUA());
    void reload().catch((e) => setError(e instanceof Error ? e.message : "无法读取钱包"));
  }, []);

  async function startPay(channel: "wechat" | "alipay") {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await createPayment({ data: { sku, channel } });
      setOrder(r);
      window.setTimeout(() => document.getElementById("pay-qr")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败");
    } finally {
      setBusy(false);
    }
  }

  async function paid() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const r = await confirmPayment({ data: { id: order.id } });
      setOrder(null);
      setOk(`${r.wallet.label}。次数或套餐已同步，可以继续问事。`);
      setWallet((prev) => (prev ? { ...prev, wallet: r.wallet } : prev));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyRemark() {
    if (!order) return;
    const text = order.remark ? `${order.amountYuan}元 ${order.remark}` : `${order.amountYuan}元`;
    const okCopy = await copyText(text);
    setCopied(okCopy);
    if (okCopy) window.setTimeout(() => setCopied(false), 1600);
  }

  const selected = PAY_SKUS.find((s) => s.id === sku);
  const creditSkus = PAY_SKUS.filter((s) => !s.plan);
  const planSkus = PAY_SKUS.filter((s) => s.plan);

  return (
    <AppShell title="充值">
      <Card>
        <p className="text-xs text-muted">当前权益</p>
        <p className="mt-1 font-display text-2xl">{wallet?.wallet.label ?? "…"}</p>
        <p className="mt-2 text-sm text-ink-soft">
          一次预测扣 1 元。包月 30 元、包季 80 元、包年 288 元，期内不限次数。
        </p>
      </Card>

      {order ? (
        <Card id="pay-qr" className="mt-4 space-y-3">
          <p className="font-display">
            {order.channel === "wechat" ? "微信" : "支付宝"}支付 {order.amountYuan} 元
          </p>
          <p className="text-sm text-muted">
            {selected?.title}。请按收款码付款 {order.amountYuan} 元
            {order.remark ? `，备注 ${order.remark}` : ""}，付完点「我已支付」，次数或套餐立即到账。
          </p>
          <div className="mx-auto w-fit rounded-[var(--radius-lg)] border border-line bg-paper p-3">
            <img
              src={order.qrSrc}
              alt={order.channel === "wechat" ? "微信收款码" : "支付宝收款码"}
              width={240}
              height={240}
              className="size-60 object-contain"
            />
          </div>
          <p className="text-center text-xs text-faint">
            {order.channel === "wechat"
              ? inWeChat
                ? "长按识别二维码付款"
                : "用微信扫上面的码，或点下面打开微信扫一扫。"
              : inAlipay
                ? "长按识别二维码付款"
                : "用支付宝扫上面的码，或点下面打开支付宝扫一扫。"}
          </p>
          <Button
            className="w-full"
            variant={order.channel === "wechat" ? "wechat" : "alipay"}
            type="button"
            onClick={() => (order.channel === "wechat" ? launchWeChatScan() : launchAlipayScan())}
          >
            {order.channel === "wechat" ? "打开微信扫码" : "打开支付宝扫码"}
          </Button>
          <button type="button" className="w-full text-center text-xs text-muted" onClick={() => void copyRemark()}>
            {copied ? "金额和备注已复制" : order.remark ? `复制金额和备注 ${order.remark}` : "复制金额"}
          </button>
          <Button className="w-full" disabled={busy} onClick={() => void paid()}>
            {busy ? "确认中…" : "我已支付，立即到账"}
          </Button>
          <button type="button" className="w-full text-center text-xs text-muted" onClick={() => setOrder(null)}>
            取消
          </button>
        </Card>
      ) : (
      <Card className="mt-4 space-y-3">
        <p className="font-display">次数</p>
        <div className="grid grid-cols-2 gap-2">
          {creditSkus.map((s) => (
            <SkuButton key={s.id} sku={s} selected={sku === s.id} onSelect={() => { setSku(s.id); setOrder(null); }} />
          ))}
        </div>
        <p className="pt-1 font-display">畅问套餐</p>
        <div className="grid grid-cols-3 gap-2">
          {planSkus.map((s) => (
            <SkuButton key={s.id} sku={s} selected={sku === s.id} onSelect={() => { setSku(s.id); setOrder(null); }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="wechat" disabled={busy} onClick={() => void startPay("wechat")}>
            微信支付
          </Button>
          <Button variant="alipay" disabled={busy} onClick={() => void startPay("alipay")}>
            支付宝
          </Button>
        </div>
      </Card>
      )}

      {ok ? <p className="mt-3 text-sm text-auspicious">{ok}</p> : null}
      {error ? <p className="mt-3 text-sm text-cinnabar">{error}</p> : null}

      {wallet?.payments.length ? (
        <Card className="mt-4">
          <p className="font-display">充值记录</p>
          <ul className="mt-3 space-y-2 text-sm">
            {wallet.payments.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-line pb-2">
                <span>
                  {p.channel === "wechat" ? "微信" : p.channel === "alipay" ? "支付宝" : "管理员"} ·{" "}
                  {(p.amount_fen / 100).toFixed(0)} 元
                  {p.remark ? ` · ${p.remark}` : ""}
                </span>
                <span className="text-xs text-faint">{p.status === "paid" ? "已到账" : "待支付"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </AppShell>
  );
}

function SkuButton({
  sku,
  selected,
  onSelect,
}: {
  sku: (typeof PAY_SKUS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        selected
          ? "rounded-[var(--radius-lg)] border border-cinnabar bg-cinnabar/8 px-3 py-3 text-left"
          : "rounded-[var(--radius-lg)] border border-line bg-paper px-3 py-3 text-left"
      }
    >
      <p className="font-display text-lg">{sku.amountYuan} 元</p>
      <p className="text-xs text-muted">{sku.title}</p>
      <p className="mt-1 text-[11px] text-faint">{sku.hint}</p>
    </button>
  );
}
