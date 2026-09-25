type ScrollLock = {
  owners: Set<symbol>;
  scrollY: number;
  pathname: string | undefined;
  rootOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
};

const academyScrollLocks = new WeakMap<Document, ScrollLock>();

/** The hero veil and mobile menu can overlap; restore the page after both close. */
export function acquireAcademyPageScrollLock(doc: Document): () => void {
  const root = doc.documentElement;
  const body = doc.body;
  const view = doc.defaultView;
  const owner = Symbol("academy-page-scroll-lock");
  let lock = academyScrollLocks.get(doc);

  if (!lock) {
    lock = {
      owners: new Set(),
      scrollY: view?.scrollY ?? 0,
      pathname: view?.location.pathname,
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    academyScrollLocks.set(doc, lock);

    // Mobile Safari can move the root despite overflow:hidden alone.
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${lock.scrollY}px`;
    body.style.width = "100%";
  }

  lock.owners.add(owner);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.owners.delete(owner);
    if (lock.owners.size > 0) return;

    academyScrollLocks.delete(doc);
    root.style.overflow = lock.rootOverflow;
    body.style.overflow = lock.bodyOverflow;
    body.style.position = lock.bodyPosition;
    body.style.top = lock.bodyTop;
    body.style.width = lock.bodyWidth;
    // A client navigation owns its new scroll position. Do not restore the
    // previous page's offset after the menu or veil unmounts on that route.
    if (view?.location.pathname === lock.pathname) {
      view?.scrollTo(0, lock.scrollY);
    }
  };
}
