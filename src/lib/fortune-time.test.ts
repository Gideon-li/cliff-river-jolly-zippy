import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beijingNowCivil, parseFortuneRelative, shiftCivil } from "./fortune-time.ts";

describe("parseFortuneRelative", () => {
  it("shifts 下个月运势 by one Beijing month, never as lots", () => {
    const now = beijingNowCivil();
    const next = shiftCivil(now, "month", 1);
    const r = parseFortuneRelative("下个月运势");
    assert.equal(r.span, "month");
    assert.equal(r.explicit, true);
    assert.ok(r.civil);
    assert.equal(r.civil.year, next.year);
    assert.equal(r.civil.month, next.month);
    assert.notEqual(r.civil.month, now.month === 12 ? 12 : now.month);
  });

  it("understands 下月 / 明年 / 这个月", () => {
    const now = beijingNowCivil();
    assert.equal(parseFortuneRelative("帮我看下月").civil?.month, shiftCivil(now, "month", 1).month);
    assert.equal(parseFortuneRelative("明年运势").span, "year");
    assert.equal(parseFortuneRelative("明年运势").civil?.year, now.year + 1);
    assert.equal(parseFortuneRelative("这个月运怎么样").span, "month");
    assert.equal(parseFortuneRelative("这个月运怎么样").civil?.month, now.month);
  });

  it("does not treat 运势 as a three-digit lot", () => {
    assert.equal(parseFortuneRelative("168").span, null);
    assert.equal(parseFortuneRelative("求签 168").span, null);
    assert.equal(parseFortuneRelative("下个月运势好不好").span, "month");
  });
});
