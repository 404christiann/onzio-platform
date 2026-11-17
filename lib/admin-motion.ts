export const ADMIN_MOTION_CURVES = {
  easeOut: "cubic-bezier(.23,1,.32,1)",
  drawer: "cubic-bezier(.32,.72,0,1)",
} as const;

export const ADMIN_MOTION_DURATIONS = {
  press: 120,
  dialogIn: 140,
  dialogOut: 90,
  sheetIn: 240,
  sheetOut: 160,
  menuIn: 140,
  menuOut: 90,
  switch: 180,
  tabUnderline: 220,
  bars: 300,
  barStagger: 40,
  listLeave: 160,
  listFlip: 240,
  listAdd: 180,
  toastIn: 200,
  toastOut: 120,
  pendingRing: 450,
  skeletonDelay: 150,
  skeletonMinimum: 350,
  skeletonCrossfade: 160,
  skeletonShimmer: 1600,
  saveColor: 220,
  saveLabel: 140,
  saveCheckDraw: 280,
  saveCheckDelay: 80,
  savePop: 320,
  savingMinimum: 400,
  savedShown: 1900,
  undoWindow: 5000,
  reducedMotionFade: 120,
} as const;

export const ADMIN_MOTION_MAX_BARS = 6;

export const ADMIN_MOTION_GREENS = {
  light: "#34C759",
  dark: "#30D158",
} as const;
