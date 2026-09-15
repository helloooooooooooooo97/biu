/** 分享页是 z-index:220 的全屏层；挂到 body 的菜单会被盖住。 */
export const SHARE_OVERLAY_Z = 360

export function overlayPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (document.querySelector('.fsdb-share-page') as HTMLElement | null) ?? document.body
}

export function overlayZ(base = 200): number {
  if (typeof document === 'undefined') return base
  return document.documentElement.classList.contains('share') ? Math.max(base, SHARE_OVERLAY_Z) : base
}
