export type ScopedSurfaceMessage = {
  message: string;
  scope: string;
};

export const reconcileScopedSurfaceMessage = (
  current: ScopedSurfaceMessage,
  liveScope: string,
): ScopedSurfaceMessage => {
  if (!current.message) return { message: "", scope: liveScope };
  if (current.scope === liveScope) return current;
  return { message: "", scope: liveScope };
};
