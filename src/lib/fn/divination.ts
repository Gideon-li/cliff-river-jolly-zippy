import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  BEIJING_LOCATION,
  EVENT_NAME,
  FORTUNE_SPAN_LABEL,
  MODE_SHORT,
  type CivilTime,
  type EventId,
  type GeoLocation,
  type Portrait,
  type SessionMode,
} from "@/lib/app-types";
import {
  GREETING,
  cluesFromScan,
  companionSay,
  extractTurn,
  inferMode,
  isPreciseLocation,
  missingProfilePrompt,
  needFortunePrompt,
  needLotsPrompt,
  needTimePrompt,
  readPortrait,
  refreshPortrait,
  shouldOpenNewFortuneChart,
  shouldOpenNewLotsChart,
  shouldOpenNewTimeChart,
  sisterSay,
  beijingNowCivil,
  parseFortuneRelative,
  type CastMode,
  type ExtractedTurn,
} from "@/lib/agent.server";
import { resolveLocation } from "@/lib/location.server";
import { runLots, runScan, type QueryBody } from "@/lib/qimen.server";
import { NeedPayError, consumeCast } from "@/lib/fn/billing";
import { hourNameOf, shichenRangeLabel } from "@/lib/shichen";
import { formatBeijing, newId, type JsonValue } from "@/lib/utils";

export { NeedPayError };
