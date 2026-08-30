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

export const BEIJING_LOCATION: GeoLocation = {
  province: "北京市",
  city: "北京市",
  district: "东城区",
  source: "fallback",
};

export const ADMIN_EMAIL = "18858839671@fortune.fun";
export const ADMIN_PHONE = "18858839671";
export const ADMIN_PASSWORD = "destiny1986";

export const PALACE_ORDER: number[] = [4, 9, 2, 3, 5, 7, 8, 1, 6];
