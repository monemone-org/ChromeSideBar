// Section P - Pinned site list ownership.
// docs/test/tab-space-association-test-cases.md#section-p---pinned-site-list-ownership
//
// Step 5 of docs/decisions/2026-07-30-shared-storage-multiple-writers.md made
// PinnedSitesManager the only writer of chrome.storage.local['pinnedSites'].
// These cases check that every sidebar mutation actually reaches it, that this
// window's mirror and background's own list never disagree, and that the two
// guards the port added (the stale-icon-patch check and the in-flight
// broadcast counter) do what they claim.
//
// Every mutation here goes through the hook callbacks on TestContext - the
// same ones PinnedBar calls - rather than through pinnedSitesManagerProxy
// directly, so a bug in a hook callback's own argument handling (updatePin's
// icon fields, say) fails a case instead of passing underneath it. Reads of
// background's list DO use the proxy, since that round trip is the only way
// to see the manager's in-memory copy.

import { DeletePinnedSiteAction } from '../../../actions/deletePinnedSiteAction';
import { pinnedSitesManagerProxy } from '../../../managers/proxies/pinnedSitesManagerProxy';
import { PinnedSite, PINNED_SITES_CHANGED } from '../../../managers/shared/pinnedSitesApi';
import { FullBackup, ImportOptions, importFullBackup } from '../../../utils/backupRestore';
import { iconToDataUrl } from '../../../utils/iconify';
import { TestCase, TestContext, TestStep } from '../types';
import { createTestPinnedSite, TEST_PINNED_PREFIX, testUrl } from '../fixtures';
import { closeTesterWindow, openPageForTester, openPinnedTab, pause } from '../actions';
import { resolveStringRef, resolveTabId, sleep } from '../stepHelpers';
import backupFixture from '../data/pinned-sites-backup.json';

// =============================================================================
// Reading the two copies
// =============================================================================

/**
 * Background's own in-memory list, via a fresh round trip. Storage being
 * correct is not what these cases check - Case 3 was a bug where storage was
 * right and background's cache stayed stale for the rest of the session.
 */
function backgroundPins(): Promise<PinnedSite[]>
{
  return pinnedSitesManagerProxy.getPinnedSites();
}

/** This window's mirror - what PinnedBar renders from. */
function mirrorPins(): readonly PinnedSite[]
{
  return pinnedSitesManagerProxy.snapshot;
}

/**
 * Only the pins this suite created. Every assertion about ORDER or COUNT has
 * to go through this: the tester's own pins are in the same list, and a case
 * that asserted on absolute positions would fail on anyone's real profile.
 */
function testPinsOnly(sites: readonly PinnedSite[]): PinnedSite[]
{
  return sites.filter(site => site.title.startsWith(TEST_PINNED_PREFIX));
}

function describePin(site: PinnedSite): string
{
  return `"${site.title}" (${site.id})`;
}

// =============================================================================
// Shared steps
// =============================================================================

/** Create a pin through the hook's addPin and record its generated id. */
function addTestPin(title: string, url: string, pinRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Add pin "${title}" as "${pinRef}"`,
    run: async (ctx) =>
    {
      await createTestPinnedSite(() => ctx, title, url, pinRef);
    },
  };
}

/**
 * The core assertion of this section: a pin is (or is not) in BOTH copies.
 * Checking only one would miss the divergence these cases exist for.
 */
function assertPinPresent(pinRef: string, present: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Pin "${pinRef}" is ${present ? 'present' : 'gone'} in this window and in background`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);

      const inMirror = mirrorPins().some(p => p.id === pinId);
      if (inMirror !== present)
      {
        throw new Error(`this window's mirror: expected pin "${pinId}" to be ${present ? 'present' : 'gone'}, it was ${inMirror ? 'present' : 'gone'}`);
      }

      const inBackground = (await backgroundPins()).some(p => p.id === pinId);
      if (inBackground !== present)
      {
        throw new Error(`background's own list: expected pin "${pinId}" to be ${present ? 'present' : 'gone'}, it was ${inBackground ? 'present' : 'gone'}`);
      }
    },
  };
}

/**
 * Compare named fields of one pin against expected values, in both copies.
 *
 * A key present with the value `undefined` means "must be unset" - that is how
 * the icon-clearing steps assert that setting an emoji really did drop the
 * custom icon rather than leaving both on the pin.
 */
function assertPinFields(pinRef: string, expected: Partial<PinnedSite>): TestStep
{
  const fields = Object.keys(expected) as Array<keyof PinnedSite>;

  return {
    kind: 'assert',
    label: `Pin "${pinRef}" has ${fields.join(', ')} as expected, in both copies`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      const copies: Array<{ where: string; sites: readonly PinnedSite[] }> = [
        { where: "this window's mirror", sites: mirrorPins() },
        { where: "background's own list", sites: await backgroundPins() },
      ];

      // Same fields checked against both copies, so a mismatch names which
      // side is wrong rather than just that they differ.
      for (const copy of copies)
      {
        const pin = copy.sites.find(p => p.id === pinId);
        if (!pin) throw new Error(`${copy.where}: pin "${pinId}" not found at all`);

        for (const field of fields)
        {
          if (pin[field] !== expected[field])
          {
            throw new Error(`${copy.where}: expected ${String(field)} to be ${JSON.stringify(expected[field])}, got ${JSON.stringify(pin[field])}`);
          }
        }
      }
    },
  };
}

/** Assert the suite's own pins appear in exactly this order, in both copies. */
function assertTestPinOrder(pinRefs: string[]): TestStep
{
  return {
    kind: 'assert',
    label: `Test pins are ordered [${pinRefs.join(', ')}] in both copies`,
    run: async (ctx) =>
    {
      const expectedIds = pinRefs.map(ref => resolveStringRef(ctx, ref));
      const copies: Array<{ where: string; sites: readonly PinnedSite[] }> = [
        { where: "this window's mirror", sites: mirrorPins() },
        { where: "background's own list", sites: await backgroundPins() },
      ];

      for (const copy of copies)
      {
        const actualIds = testPinsOnly(copy.sites).map(p => p.id);
        if (actualIds.join('|') !== expectedIds.join('|'))
        {
          const actualTitles = testPinsOnly(copy.sites).map(describePin).join(', ');
          throw new Error(`${copy.where}: expected order [${pinRefs.join(', ')}], got [${actualTitles}]`);
        }
      }
    },
  };
}

/** Edit a pin through the hook's updatePin, the same call the edit dialog makes. */
function updatePinStep(
  pinRef: string,
  label: string,
  edit: { title: string; url: string; customIconName?: string; iconColor?: string; emoji?: string }
): TestStep
{
  return {
    kind: 'action',
    label: `Update pin "${pinRef}": ${label}`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      ctx.updatePin(pinId, edit.title, edit.url, undefined, edit.customIconName, edit.iconColor, edit.emoji);
    },
  };
}

function removePinStep(pinRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Remove pin "${pinRef}"`,
    run: async (ctx) =>
    {
      ctx.removePin(resolveStringRef(ctx, pinRef));
    },
  };
}

function movePinStep(activeRef: string, overRef: string, position: 'before' | 'after'): TestStep
{
  return {
    kind: 'action',
    label: `Move pin "${activeRef}" ${position} "${overRef}"`,
    run: async (ctx) =>
    {
      ctx.movePin(resolveStringRef(ctx, activeRef), resolveStringRef(ctx, overRef), position);
    },
  };
}

function resetFaviconStep(pinRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Reset pin "${pinRef}" to its site icon`,
    run: async (ctx) =>
    {
      await ctx.resetFavicon(resolveStringRef(ctx, pinRef));
    },
  };
}

/**
 * Duplicate a pin and record the copy's id.
 *
 * duplicatePin generates the new id inside the hook and returns nothing, so
 * the copy is identified the only way it can be: the other pin sharing this
 * one's URL. That is also why the caller must not point two pins at the same
 * URL in a case that duplicates.
 */
function duplicatePinStep(pinRef: string, duplicateRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Duplicate pin "${pinRef}" as "${duplicateRef}"`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      const original = mirrorPins().find(p => p.id === pinId);
      if (!original) throw new Error(`duplicatePinStep: pin "${pinId}" not in the mirror`);

      ctx.duplicatePin(pinId);

      const copy = mirrorPins().find(p => p.url === original.url && p.id !== pinId);
      if (!copy) throw new Error(`duplicatePinStep: no copy of ${describePin(original)} appeared in the mirror`);

      ctx.refs.set(duplicateRef, copy.id);
    },
  };
}

// =============================================================================
// P.1 - every pin mutation reaches background's own list
// =============================================================================

// Seven of the manager's ten methods have no other coverage at all, so this
// case is deliberately one long pass rather than several small ones: the pin
// carries its state from step to step, which is also what catches an edit
// that silently clears a field it shouldn't.
export const P1_EVERY_MUTATION_REACHES_BACKGROUND: TestCase = {
  id: 'P.1',
  title: "Every pin mutation reaches background's own list",
  steps: [
    addTestPin('P1 pin', testUrl('p1-pin'), 'pin'),
    assertPinPresent('pin', true),

    updatePinStep('pin', 'new title and URL', {
      title: `${TEST_PINNED_PREFIX}P1 renamed`,
      url: testUrl('p1-renamed'),
    }),
    assertPinFields('pin', { title: `${TEST_PINNED_PREFIX}P1 renamed`, url: testUrl('p1-renamed') }),

    // The icon fields are replaced as a set (see PinnedSiteEdit), so each of
    // the next two steps has to CLEAR what the previous one set, not sit
    // alongside it.
    updatePinStep('pin', 'set an emoji', {
      title: `${TEST_PINNED_PREFIX}P1 renamed`,
      url: testUrl('p1-renamed'),
      emoji: '🎧',
    }),
    assertPinFields('pin', { emoji: '🎧', customIconName: undefined, iconColor: undefined }),

    updatePinStep('pin', 'swap the emoji for a custom icon', {
      title: `${TEST_PINNED_PREFIX}P1 renamed`,
      url: testUrl('p1-renamed'),
      customIconName: 'star',
      iconColor: '#ef4444',
    }),
    assertPinFields('pin', { customIconName: 'star', iconColor: '#ef4444', emoji: undefined }),

    // Deliberately does not assert on favicon: the URL is synthetic, so
    // Chrome's cache has nothing and fetchFaviconAsBase64 filters its default
    // globe down to undefined. What matters is that the custom icon and emoji
    // are both gone.
    resetFaviconStep('pin'),
    assertPinFields('pin', { customIconName: undefined, iconColor: undefined, emoji: undefined }),

    duplicatePinStep('pin', 'dup'),
    assertPinPresent('dup', true),
    assertTestPinOrder(['pin', 'dup']),

    movePinStep('dup', 'pin', 'before'),
    assertTestPinOrder(['dup', 'pin']),

    removePinStep('pin'),
    removePinStep('dup'),
    assertPinPresent('pin', false),
    assertPinPresent('dup', false),
  ],
};

// =============================================================================
// P.2 - read-after-write
// =============================================================================

/**
 * Fire two adds without awaiting the first, then wait for both.
 *
 * This is the shape that used to lose a write: each callback built its new
 * array from the list captured at render, so the second call overwrote the
 * first instead of building on it. Sequential awaits would not reproduce it -
 * the overlap is the test.
 */
function addTwoPinsConcurrently(
  first: { title: string; url: string; ref: string },
  second: { title: string; url: string; ref: string }
): TestStep
{
  return {
    kind: 'action',
    label: `Add pins "${first.ref}" and "${second.ref}" without waiting in between`,
    run: async (ctx) =>
    {
      const firstTitle = `${TEST_PINNED_PREFIX}${first.title}`;
      const secondTitle = `${TEST_PINNED_PREFIX}${second.title}`;

      await Promise.all([
        ctx.addPin(first.url, firstTitle),
        ctx.addPin(second.url, secondTitle),
      ]);

      // Both ids come out of the mirror rather than storage: if the older
      // snapshot bug were back, one of these would simply not be there, which
      // is the failure this case wants to report.
      for (const [title, ref] of [[firstTitle, first.ref], [secondTitle, second.ref]] as const)
      {
        const pin = mirrorPins().find(p => p.title === title);
        if (!pin) throw new Error(`"${title}" is missing from the mirror right after both adds resolved - one add overwrote the other`);
        ctx.refs.set(ref, pin.id);
      }
    },
  };
}

/** Remove two pins in the same tick, the delete-side version of the above. */
function removeTwoPinsConcurrently(firstRef: string, secondRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Remove pins "${firstRef}" and "${secondRef}" without waiting in between`,
    run: async (ctx) =>
    {
      ctx.removePin(resolveStringRef(ctx, firstRef));
      ctx.removePin(resolveStringRef(ctx, secondRef));
    },
  };
}

/**
 * Read the mirror on the line after a remove, with nothing awaited between.
 *
 * The optimistic write is what makes this pass; a React-state mirror could
 * not, since setState does not change the const the running function already
 * captured. One step, because the runner's settle delay between steps would
 * hide exactly the gap being tested.
 */
function assertRemoveIsVisibleImmediately(pinRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Removing "${pinRef}" is visible in the mirror on the very next line`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      if (!mirrorPins().some(p => p.id === pinId))
      {
        throw new Error(`pin "${pinId}" was already gone before the remove - the case cannot prove anything`);
      }

      ctx.removePin(pinId);

      if (mirrorPins().some(p => p.id === pinId))
      {
        throw new Error(`pin "${pinId}" is still in the mirror immediately after removePin returned - the optimistic write did not happen`);
      }
    },
  };
}

export const P2_READ_AFTER_WRITE: TestCase = {
  id: 'P.2',
  title: 'Read-after-write: two pin mutations in a row',
  steps: [
    addTwoPinsConcurrently(
      { title: 'P2 pin one', url: testUrl('p2-one'), ref: 'pinOne' },
      { title: 'P2 pin two', url: testUrl('p2-two'), ref: 'pinTwo' }
    ),
    assertPinPresent('pinOne', true),
    assertPinPresent('pinTwo', true),

    removeTwoPinsConcurrently('pinOne', 'pinTwo'),
    assertPinPresent('pinOne', false),
    assertPinPresent('pinTwo', false),

    addTestPin('P2 pin three', testUrl('p2-three'), 'pinThree'),
    assertRemoveIsVisibleImmediately('pinThree'),
    // And the same removal reached background, not just the local mirror.
    assertPinPresent('pinThree', false),
  ],
};

// =============================================================================
// P.3 - delete and undo restores position
// =============================================================================

/**
 * Delete pins through DeletePinnedSiteAction, built exactly as PinnedBar's
 * unpin menu item builds it - same snapshot getter, same tab-id lookup - so
 * this exercises the real undo path rather than a stand-in for it.
 */
function deletePins(pinRefs: string[], actionRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Delete pins [${pinRefs.join(', ')}] (DeletePinnedSiteAction.do)`,
    run: async (ctx) =>
    {
      const pinIds = pinRefs.map(ref => resolveStringRef(ctx, ref));
      const action = new DeletePinnedSiteAction(pinIds, () => mirrorPins(), ctx.getTabIdForPinned);
      await action.do();
      ctx.refs.set(actionRef, action);
    },
  };
}

function undoPinDelete(actionRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Undo the pin delete held in "${actionRef}"`,
    run: async (ctx) =>
    {
      const action = ctx.refs.get(actionRef);
      if (!(action instanceof DeletePinnedSiteAction))
      {
        throw new Error(`undoPinDelete: ref "${actionRef}" does not hold a DeletePinnedSiteAction`);
      }
      await action.undo();
    },
  };
}

/** Assert a tab is gone, for the "delete closes the pin's tab" step. */
function assertTabClosed(tabRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is closed`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      try
      {
        await chrome.tabs.get(tabId);
      }
      catch
      {
        return;  // gone, which is what we want
      }
      throw new Error(`tab ${tabId} is still open - deleting its pin should have closed it`);
    },
  };
}

export const P3_DELETE_AND_UNDO_RESTORES_POSITION: TestCase = {
  id: 'P.3',
  title: 'Delete and undo restores a pin at its original position',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'P3 pin one', testUrl('p3-one'), 'pinOne');
    await createTestPinnedSite(getCtx, 'P3 pin two', testUrl('p3-two'), 'pinTwo');
    await createTestPinnedSite(getCtx, 'P3 pin three', testUrl('p3-three'), 'pinThree');
    await createTestPinnedSite(getCtx, 'P3 pin four', testUrl('p3-four'), 'pinFour');
  },
  steps: [
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree', 'pinFour']),

    // Deleting from the MIDDLE is the point - an undo that appends rather
    // than splicing would still pass a delete of the last pin.
    deletePins(['pinTwo'], 'deleteOne'),
    assertTestPinOrder(['pinOne', 'pinThree', 'pinFour']),
    undoPinDelete('deleteOne'),
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree', 'pinFour']),

    // Two at once, from non-adjacent positions: each has to come back at its
    // own index, which only works if the undo re-inserts in ascending order.
    deletePins(['pinOne', 'pinThree'], 'deleteTwo'),
    assertTestPinOrder(['pinTwo', 'pinFour']),
    undoPinDelete('deleteTwo'),
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree', 'pinFour']),

    // A pin with a live tab: do() closes the tab, undo() restores pin data
    // only and must NOT reopen it.
    openPinnedTab({ pinRef: 'pinFour', url: testUrl('p3-four'), tabRef: 'tabFour' }),
    deletePins(['pinFour'], 'deleteThree'),
    assertPinPresent('pinFour', false),
    assertTabClosed('tabFour'),
    undoPinDelete('deleteThree'),
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree', 'pinFour']),
    assertTabClosed('tabFour'),
  ],
};

// =============================================================================
// P.4 - background's cache reflects a sidebar change immediately
// =============================================================================

/**
 * Add then remove a pin, reading background's own list right after each,
 * inside ONE step.
 *
 * It has to be one step: the runner sleeps between steps, and "immediately"
 * is the whole claim. This is the pinned-sites equivalent of D.3, except
 * background had no in-memory pin list at all before step 5, so this is a new
 * guarantee rather than a fixed bug.
 */
function assertBackgroundCacheTracksAddAndRemove(title: string, url: string): TestStep
{
  return {
    kind: 'assert',
    label: "Background's own list gains and drops a pin with no other edit in between",
    run: async (ctx) =>
    {
      const taggedTitle = `${TEST_PINNED_PREFIX}${title}`;
      await ctx.addPin(url, taggedTitle);

      const afterAdd = await backgroundPins();
      const added = afterAdd.find(p => p.title === taggedTitle);
      if (!added)
      {
        throw new Error(`background's own list does not have "${taggedTitle}" immediately after addPin resolved`);
      }

      ctx.removePin(added.id);

      const afterRemove = await backgroundPins();
      if (afterRemove.some(p => p.id === added.id))
      {
        throw new Error(`background's own list still has ${describePin(added)} immediately after removePin - its in-memory copy and storage have diverged`);
      }
    },
  };
}

export const P4_BACKGROUND_CACHE_IS_IMMEDIATE: TestCase = {
  id: 'P.4',
  title: "Background's own pin cache reflects a sidebar change immediately",
  steps: [
    assertBackgroundCacheTracksAddAndRemove('P4 pin', testUrl('p4-pin')),
  ],
};

// =============================================================================
// P.5 - a late icon patch must not overwrite a newer choice
// =============================================================================

// Not a real image - nothing renders it, and every assertion below only ever
// compares against it. A recognisable string makes a failure obvious in the
// error message.
const STALE_PATCH_FAVICON = 'data:image/png;base64,INPANEL-TEST-STALE-PATCH';

/**
 * Send a favicon patch the way a resolve that started before the user's last
 * edit would land - straight at the proxy, since no hook callback exposes
 * this. `forCustomIconName` is what makes it stale: it names the icon the
 * patch was resolved for, which the pin no longer has.
 */
function sendStaleFaviconPatch(pinRef: string, forCustomIconName?: string): TestStep
{
  return {
    kind: 'action',
    label: forCustomIconName
      ? `Send a late icon patch for "${pinRef}" resolved for "${forCustomIconName}"`
      : `Send a late site-favicon patch for "${pinRef}"`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      await pinnedSitesManagerProxy.setFavicons([
        { id: pinId, favicon: STALE_PATCH_FAVICON, forCustomIconName },
      ]);
    },
  };
}

/**
 * The pin must not be wearing the stale patch.
 *
 * Deliberately not "favicon is still unset": the sidebar's own lazy resolver
 * legitimately fills in a favicon for a pin with a custom icon, and it may
 * well have done so by the time this runs. What must never happen is the
 * SPECIFIC stale value landing.
 */
function assertStalePatchWasDropped(pinRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Pin "${pinRef}" did not take the stale patch`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      const copies: Array<{ where: string; sites: readonly PinnedSite[] }> = [
        { where: "this window's mirror", sites: mirrorPins() },
        { where: "background's own list", sites: await backgroundPins() },
      ];

      for (const copy of copies)
      {
        const pin = copy.sites.find(p => p.id === pinId);
        if (!pin) throw new Error(`${copy.where}: pin "${pinId}" not found at all`);
        if (pin.favicon === STALE_PATCH_FAVICON)
        {
          throw new Error(`${copy.where}: ${describePin(pin)} took a patch resolved for an icon it no longer has`);
        }
      }
    },
  };
}

export const P5_LATE_ICON_PATCH_IS_DROPPED: TestCase = {
  id: 'P.5',
  title: 'A late icon patch must not overwrite a newer choice',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'P5 icon pin', testUrl('p5-icon'), 'iconPin');
    await createTestPinnedSite(getCtx, 'P5 emoji pin', testUrl('p5-emoji'), 'emojiPin');
  },
  steps: [
    // Custom icon "star", then swapped for "heart" before the (simulated)
    // resolve for "star" lands.
    updatePinStep('iconPin', 'set custom icon "star"', {
      title: `${TEST_PINNED_PREFIX}P5 icon pin`,
      url: testUrl('p5-icon'),
      customIconName: 'star',
    }),
    updatePinStep('iconPin', 'swap it for "heart"', {
      title: `${TEST_PINNED_PREFIX}P5 icon pin`,
      url: testUrl('p5-icon'),
      customIconName: 'heart',
    }),
    sendStaleFaviconPatch('iconPin', 'star'),
    assertPinFields('iconPin', { customIconName: 'heart' }),
    assertStalePatchWasDropped('iconPin'),

    // The other half: a site-favicon patch (no forCustomIconName) aimed at a
    // pin that has since been given an emoji.
    updatePinStep('emojiPin', 'set an emoji', {
      title: `${TEST_PINNED_PREFIX}P5 emoji pin`,
      url: testUrl('p5-emoji'),
      emoji: '🎯',
    }),
    sendStaleFaviconPatch('emojiPin'),
    assertPinFields('emojiPin', { emoji: '🎯' }),
    assertStalePatchWasDropped('emojiPin'),
  ],
};

// =============================================================================
// P.6 - Scenario 5, background fills in a missing favicon
// =============================================================================

/**
 * The real sites P.6 and P.7 pin, one each.
 *
 * Both cases need a site whose favicon Chrome does NOT already hold, which is
 * what the guided "clear browsing data" step at the start of P.6 arranges. A
 * unique query string is no substitute: Chrome hands back the icon it holds
 * for the SITE whenever it has nothing for the exact address.
 *
 * The two cases use different sites so that running one does not give the
 * other's site an icon. These are the only cases in the suite that need the
 * network.
 */
const P6_FAVICON_SITE = 'https://www.wikipedia.org/';
const P7_FAVICON_SITE = 'https://www.mozilla.org/';

/** Create a pin on a site whose icon Chrome should not have, remembering its URL. */
function addColdFaviconPin(title: string, url: string, pinRef: string, urlRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Add pin "${title}" on ${url}`,
    run: async (ctx) =>
    {
      ctx.refs.set(urlRef, url);
      await createTestPinnedSite(() => ctx, title, url, pinRef);
    },
  };
}

function assertPinHasNoFavicon(pinRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Pin "${pinRef}" starts with no favicon`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      const pin = (await backgroundPins()).find(p => p.id === pinId);
      if (!pin) throw new Error(`background's own list: pin "${pinId}" not found`);
      if (pin.favicon)
      {
        throw new Error(`${describePin(pin)} already has a favicon, so nothing here can prove background filled one in. `
          + 'Chrome still holds an icon for this site, which means the browsing-data clear at the start of this case '
          + 'either did not include "Browsing history" (favicons are stored with history, not with cached files), '
          + 'or the site has been loaded again since. Clear it again and rerun.');
      }
    },
  };
}

/**
 * Start listening for the broadcast that proves BACKGROUND wrote the favicon.
 *
 * The sidebar's own lazy resolver also fills missing favicons, and the result
 * looks identical on screen. The discriminator is the message: a
 * PINNED_SITES_CHANGED with no senderId can only have come from background,
 * since every sidebar-originated call stamps one. Registered as its own step,
 * before the tab opens, so the broadcast cannot land in an unobserved gap.
 */
function watchForBackgroundFaviconBroadcast(pinRef: string, watchRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Start watching for background's own favicon broadcast for "${pinRef}"`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);

      // Initialised to a no-op rather than left undefined: handleMessage below
      // closes over it, and strict mode has no way to know the Promise
      // executor already ran.
      let settle: () => void = () => {};
      const seen = new Promise<void>(resolve => { settle = resolve; });

      function handleMessage(message: { action?: string; senderId?: string; sites?: PinnedSite[] })
      {
        if (message?.action !== PINNED_SITES_CHANGED) return;
        if (message.senderId !== undefined) return;  // a sidebar's own write, not background's

        const pin = message.sites?.find(p => p.id === pinId);
        if (pin?.favicon) settle();
      }

      chrome.runtime.onMessage.addListener(handleMessage);
      ctx.refs.set(watchRef, {
        seen,
        stop: () => chrome.runtime.onMessage.removeListener(handleMessage),
      });
    },
  };
}

/** Open a tab on a URL held in refs, so Chrome loads the page and caches its favicon. */
function openTabForUrlRef(urlRef: string, tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Open a tab on the URL in "${urlRef}"`,
    run: async (ctx) =>
    {
      const tab = await chrome.tabs.create({ url: resolveStringRef(ctx, urlRef), active: false });
      if (tab.id === undefined) throw new Error('chrome.tabs.create did not return a tab id');
      ctx.refs.set(tabRef, tab.id);
    },
  };
}

function assertBackgroundBroadcastArrived(watchRef: string, timeoutMs: number): TestStep
{
  return {
    kind: 'assert',
    label: `Background broadcast a favicon within ${timeoutMs}ms`,
    run: async (ctx) =>
    {
      const watch = ctx.refs.get(watchRef) as { seen: Promise<void>; stop: () => void } | undefined;
      if (!watch) throw new Error(`assertBackgroundBroadcastArrived: no watcher in ref "${watchRef}"`);

      const TIMED_OUT = Symbol('timeout');
      const outcome = await Promise.race([
        watch.seen,
        sleep(timeoutMs).then(() => TIMED_OUT),
      ]);
      watch.stop();

      if (outcome === TIMED_OUT)
      {
        throw new Error('no unsigned PINNED_SITES_CHANGED arrived in time. Either background never patched the favicon (Scenario 5 broken), the site has no favicon, the network is down, or the sidebar resolver got there first');
      }
    },
  };
}

/** Close a tab this case opened. Cleanup only closes test-prefixed URLs, and this one is a real site. */
function closeTabRef(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Close the tab in "${tabRef}"`,
    run: async (ctx) =>
    {
      const tabId = ctx.refs.get(tabRef);
      if (typeof tabId !== 'number') return;
      try { await chrome.tabs.remove(tabId); }
      catch { /* already closed */ }
    },
  };
}

export const P6_BACKGROUND_FILLS_MISSING_FAVICON: TestCase = {
  id: 'P.6',
  title: 'Scenario 5 - background fills in a missing favicon (guided, needs network)',
  steps: [
    // The runner opens the settings page; the dialog itself is a chrome://
    // page, which an extension cannot script, so the three choices inside it
    // stay manual. Clearing by hand rather than through chrome.browsingData
    // also keeps that permission out of the manifest.
    openPageForTester({ url: 'chrome://settings/clearBrowserData', ref: 'clearDataTab' }),
    pause(
      'Manual step: clear Chrome\'s stored favicons',
      [
        'In the Clear browsing data dialog that just opened, tick **Browsing history**.',
        'Set the time range to **All time** - anything shorter leaves the icon for this case\'s site in place.',
        'Click **Delete data**, then come back and click Resume.',
      ]
    ),
    closeTabRef('clearDataTab'),
    addColdFaviconPin('P6 pin', P6_FAVICON_SITE, 'pin', 'pinUrl'),
    assertPinHasNoFavicon('pin'),

    watchForBackgroundFaviconBroadcast('pin', 'watch'),
    openTabForUrlRef('pinUrl', 'tab'),
    assertBackgroundBroadcastArrived('watch', 20000),

    // The broadcast said so; this confirms the manager's own list agrees.
    {
      kind: 'assert',
      label: 'Background\'s own list now has a favicon for the pin',
      run: async (ctx) =>
      {
        const pinId = resolveStringRef(ctx, 'pin');
        const pin = (await backgroundPins()).find(p => p.id === pinId);
        if (!pin?.favicon) throw new Error('background broadcast a favicon but its own list does not have one');
      },
    },

    closeTabRef('tab'),
  ],
};

// =============================================================================
// P.7 - a background favicon patch must not resurrect an unpinned pin
// =============================================================================

// P.7 races a background favicon write against an unpin, so it needs a site
// whose icon Chrome does not already hold - the same precondition as P.6, and
// the same guided clear at the start of P.6 covers it. If Chrome does already
// have this site's icon, the case still checks that this window's list agrees
// with background's, but the background write it wants to race never happens,
// so a pass proves less than usual.
const P7_RACE_URL = P7_FAVICON_SITE;
const P7_PIN_B_TITLE = `${TEST_PINNED_PREFIX}P7 pin B`;

/**
 * The assertion this case exists for: this window and background hold the
 * same list. A stale broadcast applied over a newer local write shows up
 * exactly here - storage correct, this window wrong.
 */
function assertMirrorMatchesBackground(): TestStep
{
  return {
    kind: 'assert',
    label: "This window's mirror matches background's own list, entry by entry",
    run: async () =>
    {
      const mirror = mirrorPins();
      const background = await backgroundPins();

      const mirrorIds = mirror.map(p => p.id).join('|');
      const backgroundIds = background.map(p => p.id).join('|');
      if (mirrorIds !== backgroundIds)
      {
        throw new Error(`mirror holds [${mirror.map(describePin).join(', ')}] but background holds [${background.map(describePin).join(', ')}]`);
      }
    },
  };
}

export const P7_FAVICON_PATCH_DOES_NOT_RESURRECT: TestCase = {
  id: 'P.7',
  title: 'A background favicon patch must not resurrect an unpinned pin (guided)',
  setup: async (getCtx) =>
  {
    const ctx = getCtx();
    ctx.refs.set('pinAUrl', P7_RACE_URL);
    await createTestPinnedSite(getCtx, 'P7 pin A', P7_RACE_URL, 'pinA');
    await createTestPinnedSite(getCtx, 'P7 pin B', testUrl('p7-b'), 'pinB');
  },
  steps: [
    assertPinPresent('pinA', true),
    assertPinPresent('pinB', true),

    pause(
      'Manual step: race a background favicon write against an unpin',
      [
        `Click this link to open the page in a background tab: ${P7_RACE_URL}`,
        `The moment you click it, unpin "${P7_PIN_B_TITLE}" from the pinned bar (right-click it, then Unpin) - closer together is better, but do not worry about being exact.`,
        'Come back to the sidebar and click Resume.',
      ]
    ),

    // B was unpinned by hand, so the refs still hold its id - the assertion
    // is that it stayed gone rather than being brought back by the favicon
    // broadcast landing after the unpin.
    assertPinPresent('pinB', false),
    assertMirrorMatchesBackground(),

    pause(
      'Check the pinned bar',
      [
        'Look at pin A in the pinned bar - a pass means its icon became the site favicon, and if the network is down or the page did not load, answer Fail and note why.',
      ],
      'Did pin A pick up the site favicon?'
    ),

    // The tester opened this one by hand, on a real site, so cleanup's
    // URL-prefix match will not close it.
    {
      kind: 'action',
      label: 'Close any tab left open on the race URL',
      run: async (ctx) =>
      {
        const url = resolveStringRef(ctx, 'pinAUrl');
        const tabs = await chrome.tabs.query({ url: `${P7_FAVICON_SITE}*` });
        const raceTabs = tabs.filter(t => t.url === url && t.id !== undefined);
        if (raceTabs.length > 0)
        {
          try { await chrome.tabs.remove(raceTabs.map(t => t.id!)); }
          catch { /* already closed */ }
        }
      },
    },
  ],
};

// =============================================================================
// P.8 - pins survive a service worker restart
// =============================================================================

// PinnedSitesManager.load() only runs on a cold start, so a mistake in it is
// invisible while the worker stays warm. Same reasoning as E.3, and the same
// warning applies: STOP the worker, do not reload the extension. A reload is a
// fresh extension load, which would repopulate from storage either way and
// prove nothing about ordering.
//
// The failure this catches: a mutation handled BEFORE load() finishes would
// write a list built from empty state, wiping every other pin. Hence deleting
// one pin and checking the other two are still there, rather than just
// checking the list is non-empty.
export const P8_PINS_SURVIVE_WORKER_RESTART: TestCase = {
  id: 'P.8',
  title: 'Pins survive a service worker restart (guided)',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'P8 pin one', testUrl('p8-one'), 'pinOne');
    await createTestPinnedSite(getCtx, 'P8 pin two', testUrl('p8-two'), 'pinTwo');
    await createTestPinnedSite(getCtx, 'P8 pin three', testUrl('p8-three'), 'pinThree');
  },
  steps: [
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree']),

    // Opened in its own window by the runner: this window's sidebar has to be
    // left alone while the worker is stopped.
    openPageForTester({ url: 'chrome://extensions', ref: 'extensionsWindow', inNewWindow: true }),
    pause(
      'Manual step: stop the service worker (do NOT reload the extension)',
      [
        'In the window that just opened, find this extension and click its **service worker** link - DevTools opens for the worker.',
        'In those DevTools, go to **Application** -> **Service Workers** and click **Stop** - waiting a minute or so for it to idle out works too.',
        'Do NOT click the extension\'s **reload** button - that reloads the whole extension, which repopulates everything anyway and makes this case prove nothing.',
        'Come back to this window by clicking inside the sidebar, and click Resume below.',
      ]
    ),
    // This is the first call after the restart, so it wakes the worker. The
    // router awaits stateReady before dispatching, which is what has to hold:
    // deleting pin two must splice it out of the FULL restored list.
    deletePins(['pinTwo'], 'deleteAfterRestart'),
    assertTestPinOrder(['pinOne', 'pinThree']),

    undoPinDelete('deleteAfterRestart'),
    assertTestPinOrder(['pinOne', 'pinTwo', 'pinThree']),

    closeTesterWindow('extensionsWindow'),
  ],
};

// =============================================================================
// P.9 - import
// =============================================================================

// The fixture ships in the repo (src/tests/inpanel/data/pinned-sites-backup.json)
// rather than being picked from disk: the file picker is the one part of the
// Import dialog no runner can drive. Everything below it - importFullBackup ->
// replacePinnedSites/appendPinnedSites -> the proxy -> the manager - is the
// identical path the dialog takes, the same shortcut D.4 uses for spaces.
function fixtureBackup(): FullBackup
{
  // Fresh copy per call: importFullBackup migrates v1 payloads in place, and
  // a shared module-level object would carry that into the next run.
  return structuredClone(backupFixture) as unknown as FullBackup;
}

const FIXTURE_TITLES = (backupFixture.pinnedSites ?? []).map(p => p.title);
const FIXTURE_IDS = (backupFixture.pinnedSites ?? []).map(p => p.id);

function importOptions(mode: 'append' | 'replace'): ImportOptions
{
  return {
    importPinnedSites: true,
    pinnedSitesMode: mode,
    importBookmarks: false,
    bookmarkMode: 'folder',
    importTabGroups: false,
    tabGroupsMode: 'append',
    importSpaces: false,
    spacesMode: 'append',
  };
}

/** Run the real import path for pins only. Spaces callbacks are never reached with importSpaces false. */
async function runPinImport(ctx: TestContext, mode: 'append' | 'replace'): Promise<void>
{
  await importFullBackup(
    fixtureBackup(),
    importOptions(mode),
    ctx.replacePinnedSites,
    ctx.appendPinnedSites,
    async () => { throw new Error('replaceSpaces must not be called with importSpaces false'); },
    async () => { throw new Error('appendSpaces must not be called with importSpaces false'); },
    []
  );
}

/** `copiesPerTitle` is 1 after a single append, 2 after importing the same fixture twice. */
function assertFixturePinsPresent(copiesPerTitle: number): TestStep
{
  return {
    kind: 'assert',
    label: `Each of the fixture's ${FIXTURE_TITLES.length} pins is present ${copiesPerTitle}x, with fresh ids, in both copies`,
    run: async () =>
    {
      const copies: Array<{ where: string; sites: readonly PinnedSite[] }> = [
        { where: "this window's mirror", sites: mirrorPins() },
        { where: "background's own list", sites: await backgroundPins() },
      ];

      for (const copy of copies)
      {
        // Every import assigns new ids, so the fixture's own ids must not
        // survive into the stored list.
        for (const site of copy.sites)
        {
          if (FIXTURE_IDS.includes(site.id))
          {
            throw new Error(`${copy.where}: ${describePin(site)} kept the fixture's own id - import must assign fresh ones`);
          }
        }

        for (const title of FIXTURE_TITLES)
        {
          const matches = copy.sites.filter(s => s.title === title);
          if (matches.length !== copiesPerTitle)
          {
            throw new Error(`${copy.where}: expected ${copiesPerTitle} copies of "${title}", found ${matches.length}`);
          }
        }
      }
    },
  };
}

/**
 * Work out WHY an icon never resolved, once the wait above has given up.
 *
 * "No favicon appeared" has two very different causes that look identical
 * from the outside - the Iconify fetch failing, or the resolver never running
 * for this pin - and the difference decides whether anything needs fixing in
 * the extension. So rather than report the ambiguity, this re-checks the
 * pin's eligibility and then calls iconToDataUrl directly: if that works, the
 * CDN is fine and the resolver is the problem.
 *
 * Returns the explanation to append to the failure message.
 */
async function diagnoseUnresolvedIcon(title: string): Promise<string>
{
  const pin = mirrorPins().find(p => p.title === title);
  if (!pin) return 'the pin is not in the list at all any more, so nothing could have resolved it';
  if (pin.emoji) return `the pin carries an emoji (${pin.emoji}) now, which makes it ineligible for icon resolution`;
  if (!pin.customIconName) return 'the pin has no customIconName any more, so nothing asked for a resolve';

  if (!navigator.onLine) return 'the browser reports itself offline, so the Iconify fetch could not have succeeded - rerun with a connection';

  const direct = await iconToDataUrl(pin.customIconName);
  if (!direct)
  {
    return `calling iconToDataUrl("${pin.customIconName}") directly ALSO failed, so this is the Iconify fetch, not the resolver. Check the sidebar console for a "Failed to load icon" warning`;
  }

  return `calling iconToDataUrl("${pin.customIconName}") directly SUCCEEDED, so the CDN is reachable and the resolver simply never ran for this pin. usePinnedSites skips its resolve effect while an earlier resolve is still in flight (isResolvingRef) and schedules no retry, which is the likeliest explanation`;
}

/**
 * The fixture's second pin ships with a customIconName and no favicon - the
 * shape an Arc import produces. The sidebar's lazy resolver should render it
 * through Iconify and store the result, with no reload.
 *
 * Needs the network, like P.6. On failure it says which of the two possible
 * causes it was - see diagnoseUnresolvedIcon.
 */
function assertCustomIconResolves(title: string, timeoutMs: number): TestStep
{
  const POLL_MS = 250;

  return {
    kind: 'assert',
    label: `"${title}" resolves its custom icon into a favicon within ${timeoutMs}ms`,
    run: async () =>
    {
      const deadline = Date.now() + timeoutMs;

      // Poll rather than waiting a fixed time: the Iconify fetch is network
      // bound, and the lazy resolver only runs once the list settles.
      while (Date.now() < deadline)
      {
        const pin = mirrorPins().find(p => p.title === title);
        if (pin?.favicon) return;
        await sleep(POLL_MS);
      }

      throw new Error(`"${title}" still has no favicon after ${timeoutMs}ms: ${await diagnoseUnresolvedIcon(title)}`);
    },
  };
}

/**
 * Replace-mode import, checked and then undone in ONE step.
 *
 * Replace wipes the WHOLE pin list, the tester's own pins included, so the
 * restore has to happen even when the assertion in the middle throws - hence
 * the try/finally rather than a following step. The restore goes through the
 * proxy's replaceAll rather than the hook's replacePinnedSites because the
 * hook assigns new ids by design, and this has to put the list back exactly
 * as it was.
 */
function assertReplaceImportThenRestore(): TestStep
{
  return {
    kind: 'assert',
    label: 'Replace-mode import replaces the entire list, then the original pins are restored',
    run: async (ctx) =>
    {
      const before = [...mirrorPins()];

      try
      {
        await runPinImport(ctx, 'replace');

        const after = await backgroundPins();
        if (after.length !== FIXTURE_TITLES.length)
        {
          throw new Error(`expected exactly the fixture's ${FIXTURE_TITLES.length} pins after a replace import, got ${after.length}: [${after.map(describePin).join(', ')}]`);
        }
        for (const site of after)
        {
          if (!FIXTURE_TITLES.includes(site.title))
          {
            throw new Error(`${describePin(site)} survived a replace import`);
          }
        }
      }
      finally
      {
        await pinnedSitesManagerProxy.replaceAll(before);
      }
    },
  };
}

export const P9_IMPORT_APPEND_AND_REPLACE: TestCase = {
  id: 'P.9',
  title: 'Import appends and replaces pins through the manager (needs network for step 3)',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'P9 original one', testUrl('p9-one'), 'origOne');
    await createTestPinnedSite(getCtx, 'P9 original two', testUrl('p9-two'), 'origTwo');
  },
  steps: [
    {
      kind: 'action',
      label: 'Import the fixture backup in append mode',
      run: async (ctx) => { await runPinImport(ctx, 'append'); },
    },
    // Appending must leave what was already there alone.
    assertPinPresent('origOne', true),
    assertPinPresent('origTwo', true),
    assertFixturePinsPresent(1),

    assertCustomIconResolves(FIXTURE_TITLES[1], 15000),

    assertReplaceImportThenRestore(),
    assertPinPresent('origOne', true),
    assertPinPresent('origTwo', true),
  ],
};

// =============================================================================
// P.10 - two windows stay in sync
// =============================================================================

// Run this case in the RECEIVING window. Every check below reads this
// window's own mirror, which only updates from a broadcast - so with the edits
// made by hand in the other window, the runner proves the broadcast arrived
// without asking the tester to judge anything. Driving it the other way round
// would reduce every step to "does the other window look right?".
//
// Counts, not titles: pins made by hand through the pinned bar can't be given
// a test-prefixed title without a lot of fiddling, and a count is enough to
// show the broadcast landed. It also means the tester's own pins don't matter.
const P10_OWN_PIN_TITLE = `${TEST_PINNED_PREFIX}P10 from window 2`;

/** Record how many pins this window currently shows, as the baseline for the deltas below. */
function recordPinCount(countRef: string): TestStep
{
  return {
    kind: 'action',
    label: 'Record this window\'s current pin count',
    run: async (ctx) =>
    {
      ctx.refs.set(countRef, mirrorPins().length);
    },
  };
}

/**
 * Wait for this window's mirror to reach baseline + delta.
 *
 * Polling, not a fixed wait: the tester performs the action in the other
 * window at their own pace, and the broadcast arrives whenever it arrives.
 */
function assertPinCountDelta(countRef: string, delta: number, timeoutMs: number): TestStep
{
  const POLL_MS = 200;

  return {
    kind: 'assert',
    label: `This window's pin count changes by ${delta} within ${timeoutMs}ms`,
    run: async (ctx) =>
    {
      const baseline = ctx.refs.get(countRef);
      if (typeof baseline !== 'number') throw new Error(`assertPinCountDelta: no count in ref "${countRef}"`);

      const expected = baseline + delta;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline)
      {
        if (mirrorPins().length === expected) return;
        await sleep(POLL_MS);
      }

      // Two very different things look identical from here: a change that
      // happened but never reached this window, and a change the tester did
      // not actually make. Background's own list tells them apart, so say
      // which it was instead of reporting a bare timeout.
      const backgroundCount = (await backgroundPins()).length;
      const diagnosis = backgroundCount === expected
        ? 'background\'s own list DOES show the change, so the broadcast to this window was lost - that is a bug in the sync, not in how the step was performed'
        : `background's own list also shows ${backgroundCount} pins, so the change never reached background at all - check that you performed it, and in the OTHER window`;

      throw new Error(`expected ${expected} pins in this window, still ${mirrorPins().length}. ${diagnosis}`);
    },
  };
}

export const P10_TWO_WINDOWS_STAY_IN_SYNC: TestCase = {
  id: 'P.10',
  title: 'Two windows stay in sync (guided, run in the receiving window)',
  steps: [
    pause(
      'Setup: open a second window with the sidebar',
      [
        'Open another Chrome window and open this extension\'s sidebar in it - that one is "the other window" in the steps below, and THIS window, the one running the test, is the receiving one.',
        'Drive only this window\'s test runner - both sidebars have their own.',
        'Click Resume when both sidebars are open.',
      ]
    ),
    recordPinCount('baseline'),

    pause(
      'Manual step: add a pin in the OTHER window',
      [
        'Switch to the other window.',
        'Pin any tab (right-click a tab row in its sidebar, or drag it to the pinned bar).',
        'Do not touch this window\'s pinned bar.',
        'Come back and click Resume.',
      ]
    ),
    assertPinCountDelta('baseline', 1, 10000),

    // Split into two pauses on purpose. One step asking for a reorder AND an
    // unpin is easy to half-complete, and the miss would only surface two
    // steps later with no clue which half went wrong.
    pause(
      'Manual step: reorder the pin in the OTHER window',
      [
        'In the other window, drag the new pin to a different position in its pinned bar.',
        'Do not unpin it yet, that is the next step.',
        'Come back and click Resume.',
      ]
    ),
    // A reorder changes order, not count, so this checks the pin is still
    // here rather than expecting a delta. It exists to keep the two manual
    // actions apart, so a missed unpin is reported as a missed unpin.
    assertPinCountDelta('baseline', 1, 10000),

    pause(
      'Manual step: unpin that same pin in the OTHER window',
      [
        'In the other window, right-click the pin you just moved and choose **Unpin**.',
        'Make sure it actually disappears from that window\'s pinned bar before continuing.',
        'Come back and click Resume.',
      ]
    ),
    assertPinCountDelta('baseline', 0, 10000),

    // The reverse direction. This half the runner cannot check itself - it
    // has no way to read the other window's mirror - so it makes the change
    // and asks.
    {
      kind: 'action',
      label: 'Add a pin in THIS window',
      run: async (ctx) => { await ctx.addPin(testUrl('p10-from-window-2'), P10_OWN_PIN_TITLE); },
    },
    pause(
      'Check the OTHER window',
      [
        'Switch to the other window and look at its pinned bar.',
        `A pin titled "${P10_OWN_PIN_TITLE}" should have appeared there, with no reload.`,
        'Come back and answer below.',
      ],
      'Did the other window show the new pin?'
    ),
  ],
};

export const SECTION_P_CASES: TestCase[] = [
  P1_EVERY_MUTATION_REACHES_BACKGROUND,
  P2_READ_AFTER_WRITE,
  P3_DELETE_AND_UNDO_RESTORES_POSITION,
  P4_BACKGROUND_CACHE_IS_IMMEDIATE,
  P5_LATE_ICON_PATCH_IS_DROPPED,
  P6_BACKGROUND_FILLS_MISSING_FAVICON,
  P7_FAVICON_PATCH_DOES_NOT_RESURRECT,
  P8_PINS_SURVIVE_WORKER_RESTART,
  P9_IMPORT_APPEND_AND_REPLACE,
  P10_TWO_WINDOWS_STAY_IN_SYNC,
];
