export type Gender = "male" | "female";

export type EventId =
  | "wealth"
  | "career"
  | "job"
  | "romance"
  | "study"
  | "health"
  | "travel"
  | "lawsuit"
  | "partner"
  | "property"
  | "negotiate"
  | "find";

export type SessionMode = "inbox" | "now" | "timed" | "fortune" | "lots";

export type FortuneSpan = "day" | "month" | "year";

export type CivilTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type GeoLocation = {
  province: string;
  city: string;
  district: string;
  source: "gps" | "ip" | "fallback" | "profile";
};

export type Portrait = {
  summary: string;
  mood: string;
  tone: string;
  situation: string;
  concerns: string[];
  traits: string[];
  care: string;
};

export const EMPTY_PORTRAIT: Portrait = {
  summary: "",
  mood: "",
  tone: "",
  situation: "",
  concerns: [],
  traits: [],
  care: "",
};

export type Profile = {
  userId: string;
  nickname: string;
  gender: Gender | null;
  birthYear: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  wechatOpenid: string | null;
  isAdmin: boolean;
  plan: PlanKind;
  planUntil: string | null;
  credits: number;
  lifetimeFree: boolean;
  createdAt: string;
};

export const EVENT_CATALOG: { id: EventId; name: string; hint: string }[] = [
  { id: "wealth", name: "求财经营", hint: "进账、生意、回款" },
  { id: "career", name: "事业官运", hint: "职场、功名" },
  { id: "job", name: "求职升迁", hint: "跳槽、面试、升职" },
  { id: "romance", name: "婚姻感情", hint: "恋爱、婚事" },
  { id: "study", name: "考试学业", hint: "考试、学业" },
  { id: "health", name: "健康疾病", hint: "身体、调养" },
  { id: "travel", name: "出行远行", hint: "出行、远行" },
  { id: "lawsuit", name: "诉讼纠纷", hint: "口舌、官司" },
  { id: "partner", name: "合作合伙", hint: "搭档、合伙" },
  { id: "property", name: "置业搬家", hint: "房产、迁居" },
  { id: "negotiate", name: "谈判签约", hint: "谈判、合同" },
  { id: "find", name: "寻人寻物", hint: "寻访、失物" },
];

export const EVENT_NAME: Record<EventId, string> = Object.fromEntries(
  EVENT_CATALOG.map((e) => [e.id, e.name]),
) as Record<EventId, string>;

export const MODE_LABEL: Record<Exclude<SessionMode, "inbox">, string> = {
  now: "按此刻时辰看",
  timed: "指定一个时间看",
  fortune: "看年运、月运或日运",
  lots: "摇卦求签（报一个三位数）",
};

export const MODE_SHORT: Record<SessionMode, string> = {
  inbox: "问事",
  now: "此刻",
  timed: "择时",
  fortune: "运势",
  lots: "摇卦",
};

export const FORTUNE_SPAN_LABEL: Record<FortuneSpan, string> = {
  day: "日运",
  month: "月运",
  year: "年运",
};

export const BEIJING_LOCATION: GeoLocation = {
  province: "北京市",
  city: "北京市",
  district: "东城区",
  source: "fallback",
};

export const ADMIN_EMAIL = "18858839671@fortune.fun";
export const ADMIN_PHONE = "18858839671";
export const ADMIN_PASSWORD = "destiny1986";

export type PlanKind = "payg" | "monthly" | "lifetime";

export type PayChannel = "wechat" | "alipay" | "admin";

export type PaySku = "credits_1" | "credits_10" | "credits_30" | "credits_88" | "monthly";

export const PAY_SKUS: {
  id: PaySku;
  title: string;
  hint: string;
  amountYuan: number;
  credits: number;
  plan?: PlanKind;
}[] = [
  { id: "credits_1", title: "1 次预测", hint: "1 元看一盘", amountYuan: 1, credits: 1 },
  { id: "credits_10", title: "10 次预测", hint: "每次 1 元", amountYuan: 10, credits: 10 },
  { id: "credits_30", title: "30 次预测", hint: "每次 1 元", amountYuan: 30, credits: 30 },
  { id: "credits_88", title: "88 次预测", hint: "多问更划算", amountYuan: 88, credits: 88 },
  { id: "monthly", title: "月租畅问", hint: "30 天不限次数", amountYuan: 30, credits: 0, plan: "monthly" },
];

export const CAST_PRICE_YUAN = 1;
export const MONTHLY_PRICE_YUAN = 30;

export const PALACE_ORDER: number[] = [4, 9, 2, 3, 5, 7, 8, 1, 6];

export const PALACE_META: Record<number, { bagua: string; direction: string; hint: string }> = {
  1: { bagua: "坎", direction: "北", hint: "水边、低处" },
  2: { bagua: "坤", direction: "西南", hint: "田野、宅地" },
  3: { bagua: "震", direction: "东", hint: "大道、闹市" },
  4: { bagua: "巽", direction: "东南", hint: "园林、学堂" },
  5: { bagua: "中", direction: "中", hint: "室内、枢纽" },
  6: { bagua: "乾", direction: "西北", hint: "高楼、楼顶" },
  7: { bagua: "兑", direction: "西", hint: "湖泽、西厢" },
  8: { bagua: "艮", direction: "东北", hint: "门口、山地" },
  9: { bagua: "离", direction: "南", hint: "厅堂、窗口" },
};

export type ManualCastInput = {
  mode: "now" | "timed" | "fortune" | "lots";
  eventId: EventId;
  civil?: CivilTime;
  lotsCode?: string;
  fortuneSpan?: FortuneSpan;
  question?: string;
};
