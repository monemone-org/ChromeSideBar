// Small shared helpers for reading typed values back out of TestContext.refs -
// used by both actions.ts (to know which tab/bookmark/space a step's params
// point at) and assertions.ts (to know what to check).

import { TestContext } from './types';

export function sleep(ms: number): Promise<void>
{
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function resolveTabId(ctx: TestContext, ref: string): number
{
  const value = ctx.refs.get(ref);
  if (typeof value !== 'number') throw new Error(`resolveTabId: no tab ref "${ref}" (call an action that sets it first)`);
  return value;
}

export function resolveStringRef(ctx: TestContext, ref: string): string
{
  const value = ctx.refs.get(ref);
  if (typeof value !== 'string') throw new Error(`resolveStringRef: no ref "${ref}" (call an action that sets it first)`);
  return value;
}

export function resolveSpace(ctx: TestContext, spaceRef: string)
{
  const spaceId = resolveStringRef(ctx, spaceRef);
  const space = ctx.getSpaceById(spaceId);
  if (!space) throw new Error(`resolveSpace: space ref "${spaceRef}" (id ${spaceId}) not found in ctx.spaces`);
  return space;
}

/** The sidebar's main scroll container (App.tsx), used by scroll-position actions/assertions in Section C. */
export function getScrollContainer(): Element
{
  const container = document.querySelector('[data-testid="sidebar-scroll-container"]');
  if (!container) throw new Error('sidebar scroll container not found in DOM');
  return container;
}

/** Routes a tab id the same way useScrollToTabItem() does: bookmark-associated tabs render under data-bookmark-id in BookmarkTree, everything else under data-tab-id in TabList. */
export function resolveTabRowSelector(ctx: TestContext, tabId: number): string
{
  const itemKey = ctx.getItemKeyForTab(tabId);
  if (itemKey?.startsWith('bookmark-')) return `[data-bookmark-id="${itemKey.substring('bookmark-'.length)}"]`;
  return `[data-tab-id="${tabId}"]`;
}

const WAIT_POLL_MS = 50;

/**
 * Retries `check` until it returns something other than undefined or false,
 * and returns that. Throws `describeFailure()` once `timeoutMs` has passed,
 * so the message can report the state as it was at the deadline.
 */
export async function waitFor<T>(
  check: () => T | undefined | false | Promise<T | undefined | false>,
  timeoutMs: number,
  describeFailure: () => string
): Promise<T>
{
  const deadline = Date.now() + timeoutMs;

  // Keep checking until the condition holds or the deadline passes
  for (;;)
  {
    const value = await check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() >= deadline) throw new Error(describeFailure());
    await sleep(WAIT_POLL_MS);
  }
}

/**
 * Resolves after the next animation frame, which is when React has committed
 * whatever the previous event caused. Capped by a timer so a panel that is
 * not being painted cannot stall a step.
 */
function nextFrame(): Promise<void>
{
  return Promise.race([
    new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    sleep(50),
  ]);
}

/** Short human description of an element, for failure messages. */
export function describeElement(element: Element | null): string
{
  if (!element) return 'nothing';
  const testId = element.getAttribute('data-testid');
  const title = element.getAttribute('title');
  return `<${element.tagName.toLowerCase()}${testId ? ` data-testid="${testId}"` : ''}${title ? ` title="${title.split('\n')[0]}"` : ''}>`;
}

interface ViewportPoint
{
  x: number;
  y: number;
}

/**
 * A stand-in for the tester's mouse, for pause `auto` runners that replace a
 * gesture inside the sidebar (press-and-hold, click, drag and drop).
 *
 * It dispatches the events a real mouse produces, in the order a browser
 * fires them: pointer events (what dnd-kit's PointerSensor reads) followed by
 * their compatibility mouse events (what React onMouseDown/onMouseUp handlers
 * such as Toolbar's history buttons read). Each event goes to whatever element
 * is on top at its coordinates, found with elementFromPoint, as a real one
 * would - so a menu overlay covering a button receives the press instead of
 * the button, exactly as it does for a person. A release over a different
 * element than the press fires its click on their nearest common ancestor,
 * which is what Chrome does.
 *
 * Every event bubbles and is composed, so listeners on the document (dnd-kit
 * attaches its move and up listeners there after a press) and React's root
 * listener both receive it.
 */
export class SimulatedMouse
{
  // A mouse is always the primary pointer, and keeps one id for its lifetime
  static readonly #POINTER_ID = 1;
  // How long a plain click holds the button - well under Toolbar's 300ms
  // hold threshold, like a quick human click
  static readonly #CLICK_PRESS_MS = 40;

  #pressedOn: Element | null = null;

  /** The centre of an element's box, in viewport coordinates. */
  static centerOf(element: Element): ViewportPoint
  {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /**
   * The centre of `element`, checked to be where a click would land on it:
   * the element (or one of its children) must be the topmost thing there.
   * Throws naming what covers it otherwise, since a person could not press it
   * either.
   */
  static reachablePointOf(element: Element, what: string): ViewportPoint
  {
    const point = SimulatedMouse.centerOf(element);
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !element.contains(hit))
    {
      throw new Error(`${what} is not reachable with the mouse: at its centre (${Math.round(point.x)}, ${Math.round(point.y)}) the topmost element is ${describeElement(hit)} - is it scrolled out of view or covered?`);
    }
    return point;
  }

  /** Press on `element`, keep the button down for `holdMs`, then release - a press-and-hold. */
  async pressAndHold(element: Element, holdMs: number, what: string): Promise<void>
  {
    const point = SimulatedMouse.reachablePointOf(element, what);
    this.#press(point);
    await sleep(holdMs);
    this.#release(point);
  }

  /** A quick click on `element`, which must be the topmost thing at its centre. */
  async click(element: Element, what: string): Promise<void>
  {
    await this.pressAndHold(element, SimulatedMouse.#CLICK_PRESS_MS, what);
  }

  /**
   * A quick click at the spot where `element` is drawn, landing on whatever is
   * on top there - for a step that clicks a control while something (an open
   * menu's overlay) is expected to be covering it.
   */
  async clickWhereDrawn(element: Element): Promise<void>
  {
    const point = SimulatedMouse.centerOf(element);
    this.#press(point);
    await sleep(SimulatedMouse.#CLICK_PRESS_MS);
    this.#release(point);
  }

  /**
   * Drag from the centre of `source` to the centre of `target` and drop.
   *
   * Satisfies a dnd-kit distance activation constraint: after the press, the
   * pointer first moves `activationDistancePx` plus a margin toward the target
   * in small steps, then waits for `isActivated` (the drag has started), then
   * travels to the target in intermediate moves, one per frame, so dnd-kit
   * sees a continuous path and re-measures as it goes. At the target it keeps
   * making one-pixel moves until `isOverTarget` says the drop target has
   * registered the hover, then makes a couple more so the drop position is
   * computed from the final coordinates, and releases.
   *
   * If anything throws mid-drag, the pointer is cancelled (pointercancel,
   * which dnd-kit treats as an aborted drag) so no drag is left hanging.
   */
  async drag(opts: {
    source: Element;
    target: Element;
    sourceName: string;
    targetName: string;
    activationDistancePx: number;
    isActivated: () => boolean;
    isOverTarget: () => boolean;
    timeoutMs: number;
  }): Promise<void>
  {
    const start = SimulatedMouse.reachablePointOf(opts.source, opts.sourceName);
    const end = SimulatedMouse.reachablePointOf(opts.target, opts.targetName);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= opts.activationDistancePx)
    {
      throw new Error(`${opts.sourceName} and ${opts.targetName} are only ${Math.round(length)}px apart, too close to start a drag (needs more than ${opts.activationDistancePx}px)`);
    }
    const along = (distance: number): ViewportPoint => ({ x: start.x + dx * distance / length, y: start.y + dy * distance / length });

    this.#press(start);
    try
    {
      // Cross the activation distance in small steps, as a hand would
      const ACTIVATION_STEP_PX = 3;
      const activationTravel = opts.activationDistancePx + 4;
      for (let travelled = ACTIVATION_STEP_PX; travelled <= activationTravel; travelled += ACTIVATION_STEP_PX)
      {
        this.#move(along(travelled));
        await nextFrame();
      }
      await waitFor(opts.isActivated, opts.timeoutMs,
        () => `the drag never started: the pointer moved ${activationTravel}px from ${opts.sourceName} but the row did not enter the dragging state`);

      // Travel the rest of the way in intermediate moves, one per frame
      const TRAVEL_STEPS = 12;
      for (let step = 1; step <= TRAVEL_STEPS; step++)
      {
        const distance = activationTravel + (length - activationTravel) * step / TRAVEL_STEPS;
        this.#move(along(distance));
        await nextFrame();
      }

      // Hover with tiny moves until the target shows it is the drop target
      let wiggle = 0;
      await waitFor(() =>
      {
        if (opts.isOverTarget()) return true;
        wiggle = wiggle === 0 ? 1 : 0;
        this.#move({ x: end.x + wiggle, y: end.y });
        return false;
      }, opts.timeoutMs, () => `the pointer reached ${opts.targetName} but it never registered as the drop target`);

      // Two more moves at the exact centre, so the drop position comes from there
      for (let i = 0; i < 2; i++)
      {
        this.#move(end);
        await nextFrame();
      }

      this.#release(end);
    }
    finally
    {
      this.#cancelIfStillPressed(end);
    }
  }

  #press(point: ViewportPoint): void
  {
    const target = this.#topmostAt(point);
    this.#pressedOn = target;
    target.dispatchEvent(new PointerEvent('pointerdown', this.#pointerInit(point, 0, 1)));
    target.dispatchEvent(new MouseEvent('mousedown', this.#mouseInit(point, 1)));
  }

  #move(point: ViewportPoint): void
  {
    const target = this.#topmostAt(point);
    // A move changes no button, which pointer events express as button -1
    target.dispatchEvent(new PointerEvent('pointermove', this.#pointerInit(point, -1, 1)));
    target.dispatchEvent(new MouseEvent('mousemove', this.#mouseInit(point, 1)));
  }

  #release(point: ViewportPoint): void
  {
    const target = this.#topmostAt(point);
    const pressedOn = this.#pressedOn ?? target;
    this.#pressedOn = null;

    target.dispatchEvent(new PointerEvent('pointerup', this.#pointerInit(point, 0, 0)));
    target.dispatchEvent(new MouseEvent('mouseup', this.#mouseInit(point, 0)));
    SimulatedMouse.#commonAncestor(pressedOn, target).dispatchEvent(new MouseEvent('click', this.#mouseInit(point, 0)));
  }

  #cancelIfStillPressed(point: ViewportPoint): void
  {
    if (!this.#pressedOn) return;
    this.#pressedOn = null;
    // A cancel changes no button either, so button is -1 as for a move
    this.#topmostAt(point).dispatchEvent(new PointerEvent('pointercancel', this.#pointerInit(point, -1, 0)));
  }

  #topmostAt(point: ViewportPoint): Element
  {
    return document.elementFromPoint(point.x, point.y) ?? document.documentElement;
  }

  static #commonAncestor(a: Element, b: Element): Element
  {
    let node: Element | null = a;
    // Walk up from `a` until reaching an element that also contains `b`
    while (node && !node.contains(b))
    {
      node = node.parentElement;
    }
    return node ?? document.documentElement;
  }

  #mouseInit(point: ViewportPoint, buttons: number): MouseEventInit
  {
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      screenX: window.screenX + point.x,
      screenY: window.screenY + point.y,
      button: 0,
      buttons,
    };
  }

  #pointerInit(point: ViewportPoint, button: number, buttons: number): PointerEventInit
  {
    return {
      ...this.#mouseInit(point, buttons),
      button,
      pointerId: SimulatedMouse.#POINTER_ID,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: buttons === 0 ? 0 : 0.5,
    };
  }
}
