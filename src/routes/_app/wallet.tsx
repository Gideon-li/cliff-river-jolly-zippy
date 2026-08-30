import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAY_SKUS, type PayChannel, type PaySku } from "@/lib/app-types";
import { confirmPayment, createPayment, getWallet } from "@/lib/fn/billing";

export const Route = createFileRoute("/_app/wallet")({ component: WalletPage });

function hashBits(id: string) {
  const cells: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  for (let i = 0; i < 21 * 21; i++) {
    h = Math.imul(h ^ (i + 13), 16777619);
    cells.push((h >>> 0) % 3 !== 0);
  }
  return cells;
}

function PayQr({ id, channel }: { id: string; channel: PayChannel }) {
  const cells = useMemo(() => hashBits(id), [id]);
  return (
    <div className="mx-auto w-fit rounded-[var(--radius-lg)] border border-line bg-paper-2 p-3">
      <div
        className="grid size-48"
        style={{ gridTemplateColumns: "repeat(21, minmax(0, 1fr))" }}
        aria-hidden
      >
        {cells.map((on, i) => (
          <span
            key={i}
            className={on ? (channel === "wechat" ? "bg-wechat" : "bg-alipay") : "bg-paper"}
          />
        ))}
      </div>
    </div>
  );
}

function WalletPage() {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof getWallet>> | null>(null);
  const [sku, setSku] = useState<PaySku>("credits_1");
  const [order, setOrder] = useState<Awaited<ReturnType<typeof createPayment>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function reload() {
    const r = await getWallet();
    setWallet(r);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "无法读取钱包"));
  }, []);

  async function startPay(channel: "wechat" | "alipay") {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await createPayment({ data: { sku, channel } });
      setOrder(r);
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
      await confirmPayment({ data: { id: order.id } });
      setOrder(null);
      setOk("到账了。可以继续问事。");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认失败");
    } finally {
      setBusy(false);
    }
  }

  const selected = PAY_SKUS.find((s) => s.id === sku);

  return (
    <AppShell title="充值">
      <Card>
        <p className="text-xs text-muted">当前权益</p>
        <p className="mt-1 font-display text-2xl">{wallet?.wallet.label ?? "…"}</p>
        <p className="mt-2 text-sm text-ink-soft">
          一次预测扣 1 元。月租 30 元，30 天内不限次数。永久免费由管理员开通。
        </p>
      </Card>

      <Card className="mt-4 space-y-3">
        <p className="font-display">选套餐</p>
        <div className="grid grid-cols-2 gap-2">
          {PAY_SKUS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSku(s.id);
                setOrder(null);
              }}
              className={
                sku === s.id
                  ? "rounded-[var(--radius-lg)] border border-cinnabar bg-cinnabar/8 px-3 py-3 text-left"
                  : "rounded-[var(--radius-lg)] border border-line bg-paper px-3 py-3 text-left"
              }
            >
              <p className="font-display text-lg">{s.amountYuan} 元</p>
              <p className="text-xs text-muted">{s.title}</p>
              <p className="mt-1 text-[11px] text-faint">{s.hint}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="wechat" disabled={busy} onClick={() => void startPay("wechat")}>
            微信支付
          </Button>
          <Button variant="alipay" disabled={busy} onClick={() => void startPay("alipay")}>
            支付宝
          </Button>
        </div>
      </Card>

      {order ? (
        <Card className="mt-4 space-y-3">
          <p className="font-display">
            {order.channel === "wechat" ? "微信" : "支付宝"}扫码支付 {order.amountYuan} 元
          </p>
          <p className="text-sm text-muted">
            {selected?.title} · 请用{order.channel === "wechat" ? "微信" : "支付宝"}完成支付，然后点到账。
          </p>
          <PayQr id={order.id} channel={order.channel} />
          <Button className="w-full" disabled={busy} onClick={() => void paid()}>
            {busy ? "确认中…" : "我已支付"}
          </Button>
          <button type="button" className="w-full text-center text-xs text-muted" onClick={() => setOrder(null)}>
            取消
          </button>
        </Card>
      ) : null}

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
