import { BEIJING_LOCATION, type GeoLocation } from "./app-types";

type Nominatim = {
  address?: {
    country_code?: string;
    state?: string;
    province?: string;
    city?: string;
    town?: string;
    county?: string;
    district?: string;
    suburb?: string;
  };
};

function chinaOf(addr: Nominatim["address"]): GeoLocation | null {
  if (!addr) return null;
  const cc = (addr.country_code ?? "").toLowerCase();
  if (cc && cc !== "cn" && cc !== "hk" && cc !== "mo" && cc !== "tw") return null;
  const province = addr.province || addr.state || "";
  const city = addr.city || addr.town || addr.county || province;
  const district = addr.district || addr.suburb || addr.county || city;
  if (!province && !city) return null;
  return {
    province: province || city,
    city: city || province,
    district: district || city || province,
    source: "gps",
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json&accept-language=zh`;
    const res = await fetch(url, {
      headers: { "User-Agent": "WenXiang-Qimen/1.0 (fortune consultation)" },
    });
    if (!res.ok) return { ...BEIJING_LOCATION };
    const data = (await res.json()) as Nominatim;
    return chinaOf(data.address) ?? { ...BEIJING_LOCATION };
  } catch {
    return { ...BEIJING_LOCATION };
  }
}

export async function locateByIp(ip?: string | null): Promise<GeoLocation> {
  try {
    const url = ip && ip !== "127.0.0.1" && ip !== "::1"
      ? `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,countryCode,regionName,city`
      : `http://ip-api.com/json/?lang=zh-CN&fields=status,countryCode,regionName,city`;
    const res = await fetch(url);
    if (!res.ok) return { ...BEIJING_LOCATION };
    const data = (await res.json()) as {
      status?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
    };
    if (data.status !== "success") return { ...BEIJING_LOCATION };
    if (data.countryCode !== "CN") return { ...BEIJING_LOCATION };
    const province = data.regionName || "北京市";
    const city = data.city || province;
    return { province, city, district: city, source: "ip" };
  } catch {
    return { ...BEIJING_LOCATION };
  }
}

export function resolveLocation(
  profile: { province?: string | null; city?: string | null; district?: string | null },
  override?: GeoLocation | null,
): GeoLocation {
  if (override?.province) return override;
  if (profile.province) {
    return {
      province: profile.province,
      city: profile.city || profile.province,
      district: profile.district || profile.city || profile.province,
      source: "profile",
    };
  }
  return { ...BEIJING_LOCATION };
}
