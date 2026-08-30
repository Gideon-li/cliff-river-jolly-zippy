import { luckPlainAdvice, withLuckAdvice, type LuckPlainInput } from "./engine/luck-plain";
import { stripModelMarkup } from "./engine/text";
import { llmChat, parseJsonObject } from "./llm";

export type ConsultCompose = {
  scene: string;
  time: string;
  place: string;
  people: string;
  content: string;
  expansion: string[];
  caution: string;
};

export type ComposeInput = {
  question: string;
  eventName: string;
  level: string;
  score: number;
  pack: string;
  brief: string;
  person?: string;
  gender?: string;
  location?: string;
  subjectLine?: string;
};

export type ChatInput = {
  question: string;
  pack: string;
  brief: string;
  history: { role: "user" | "assistant"; content: string }[];
  person?: string;
  location?: string;
  subjectLine?: string;
  luck?: LuckPlainInput;
};

const SYSTEM_COMPOSE = `你是「问象」，温和积极的知心大姐姐，用奇门象征库联想一件具体的事。
规则：
1. 只能使用用户提供的象征库词条。
2. 语气口语、柔和；不要鸡汤，不要保证应验。
3. 地点优先写方位和建筑类型。若提示「地点宜模糊」，禁止写省市县名。
4. 只输出 JSON，字段：scene（不超过 200 字的总述），time，place，people，content，expansion（最多 2 条），caution（一句提醒）。
5. JSON 字符串里禁止井号、星号、反引号或 Markdown。`;

const SYSTEM_CHAT = `你是「问象」，温和积极的知心大姐姐。依据九宫摘要作答。
- 全文不超过 200 个汉字，只写核心判断、方位或建筑类型、一句建议。
- 不要分点，不要「一、二、三」，不要 Markdown。
- 若提示地点宜模糊，禁止出现省市县名，只写方位和建筑类型。
- 不夸张，不保证。供参考，并非定论。`;

function clip(s: string, n: number) {
  return s.replace(/\s+/g, " ").trim().slice(0, n);
}

function cleanField(v: unknown, n: number) {
  return stripModelMarkup(String(v ?? "")).slice(0, n);
}

export async function composeAssociation(data: ComposeInput) {
  const question = clip(data.question || `请就「${data.eventName}」联想一件最可能发生的具体事情`, 400);
  const pack = clip(data.pack, 4500);
  const brief = clip(data.brief, 1200);
  const who = [data.person, data.gender === "female" ? "女" : data.gender === "male" ? "男" : ""]
    .filter(Boolean)
    .join("·");
  const loc = clip(data.location ?? "", 40);
  const user = [
    data.subjectLine ? clip(data.subjectLine, 200) : "",
    `问：${question}`,
    `事项 ${data.eventName}，分值 ${data.score > 0 ? "+" : ""}${data.score}，总断${data.level}。`,
    who ? `称呼：${who}` : "",
    loc ? `地理位置：${loc}` : "",
    `九宫摘要：${brief}`,
    pack,
    "输出纯 JSON。字符串内不要出现 # * ` 等标记。",
  ]
    .filter(Boolean)
    .join("\n");
  const r = await llmChat(
    [
      { role: "system", content: SYSTEM_COMPOSE },
      { role: "user", content: user },
    ],
    { json: true, maxTokens: 700 },
  );
  if (!r.ok) return { ok: false as const, error: r.error };
  const obj = parseJsonObject(r.text);
  if (!obj) return { ok: false as const, error: "模型返回无法解析" };
  const expansion = Array.isArray(obj.expansion)
    ? obj.expansion.map((x) => cleanField(x, 200)).filter(Boolean).slice(0, 4)
    : [];
  const result: ConsultCompose = {
    scene: cleanField(obj.scene, 800),
    time: cleanField(obj.time, 120),
    place: cleanField(obj.place, 120),
    people: cleanField(obj.people, 120),
    content: cleanField(obj.content, 400),
    expansion,
    caution: cleanField(obj.caution, 200),
  };
  if (!result.scene && !result.content) return { ok: false as const, error: "模型没有给出事情" };
  return { ok: true as const, result };
}

export async function consultChart(data: ChatInput) {
  const question = clip(data.question, 400);
  if (!question) return { ok: false as const, error: "请先写下要问的事" };
  const pack = clip(data.pack, 4500);
  const brief = clip(data.brief, 1200);
  const history = (data.history ?? []).slice(-8).map((m) => ({
    role: m.role,
    content: stripModelMarkup(clip(m.content, 1200)),
  }));
  const header = [
    data.subjectLine ? clip(data.subjectLine, 200) : "",
    data.person ? `称呼：${clip(data.person, 40)}` : "",
    data.location ? `地理位置：${clip(data.location, 40)}` : "",
    data.luck ? `事项「${data.luck.eventName}」总断${data.luck.level}（${data.luck.score > 0 ? "+" : ""}${data.luck.score}）。` : "",
    `九宫摘要：${brief}`,
    pack,
    "只写「一、」「二、」两段。不要写第三段，不要井号星号。",
  ]
    .filter(Boolean)
    .join("\n");
  const r = await llmChat(
    [
      { role: "system", content: SYSTEM_CHAT },
      { role: "user", content: header },
      { role: "assistant", content: "已记住当前盘面、预测对象与象征库。请提问。只写一、二两段，用纯文本。" },
      ...history,
      { role: "user", content: question },
    ],
    { maxTokens: 800 },
  );
  if (!r.ok) return { ok: false as const, error: r.error };
  const body = stripModelMarkup(r.text).slice(0, 2200);
  const advice = data.luck ? luckPlainAdvice(data.luck) : "";
  const text = advice ? withLuckAdvice(body, advice) : body;
  return { ok: true as const, text: stripModelMarkup(text).slice(0, 2800) };
}
