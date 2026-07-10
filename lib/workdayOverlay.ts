import {
  APPLICATION_OVERLAY_ACTIONS,
  ensureApplicationOverlay,
  getApplicationOverlayMarkup,
  registerApplicationOverlayBridge
} from "@/lib/applicationOverlay";

export const WORKDAY_OVERLAY_ACTIONS = APPLICATION_OVERLAY_ACTIONS;

export const getWorkdayOverlayMarkup = getApplicationOverlayMarkup;
export const registerWorkdayOverlayBridge = registerApplicationOverlayBridge;
export const ensureWorkdayOverlay = ensureApplicationOverlay;
