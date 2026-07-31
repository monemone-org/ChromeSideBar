// Action and assertion implementations, dispatched by name from YAML test
// case steps (see e2e/run-test-cases.mjs). Mutating actions call chrome.*
// APIs directly (via worker.evaluate()) rather than simulating clicks/drags
// in the panel's UI - the extension reacts to the same underlying Chrome
// events either way, so this exercises the real background.ts logic without
// needing the panel's own page to be scriptable (which we've proven it
// isn't, reliably, via Playwright).
//
// `refs` is a plain object the runner maintains per test case, mapping the
// symbolic names test cases use (`as: tab1`) to whatever the action produced
// (e.g. { tabId, windowId } for tabs, the bookmark/pinned node for those).

import { openSidebar, closeSidebar } from './chromeDriver.mjs';

async function currentWindowId(worker)
{
  return worker.evaluate(async () =>
  {
    const win = await chrome.windows.getCurrent();
    return win.id;
  });
}

async function ensureGroup(worker, windowId, tabId, spaceName)
{
  return worker.evaluate(async ({ windowId, tabId, spaceName }) =>
  {
    const groups = await chrome.tabGroups.query({ windowId, title: spaceName });
    if (groups.length > 0)
    {
      await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
      return groups[0].id;
    }
    const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title: spaceName });
    return groupId;
  }, { windowId, tabId, spaceName });
}

async function storeAssociation(worker, windowId, tabId, itemKey)
{
  await worker.evaluate(async ({ windowId, tabId, itemKey }) =>
  {
    const key = `tabAssociations_${windowId}`;
    const existing = (await chrome.storage.session.get(key))[key] || {};
    existing[tabId] = itemKey;
    await chrome.storage.session.set({ [key]: existing });
  }, { windowId, tabId, itemKey });
}

// --- Actions (mutate state) ---

export const actions = {

  async open_regular_tab(session, refs, step)
  {
    const windowId = await currentWindowId(session.worker);
    const tabId = await session.worker.evaluate(async ({ url, windowId }) =>
    {
      const tab = await chrome.tabs.create({ url, active: false, windowId });
      return tab.id;
    }, { url: step.url, windowId });

    if (step.space)
    {
      await ensureGroup(session.worker, windowId, tabId, step.space);
    }

    if (step.as) refs[step.as] = { tabId, windowId };
  },

  async open_bookmark_tab(session, refs, step)
  {
    const bookmark = refs[step.bookmark];
    const space = refs.__spaces[step.space];
    const windowId = await currentWindowId(session.worker);

    const tabId = await session.worker.evaluate(async ({ url, windowId }) =>
    {
      const tab = await chrome.tabs.create({ url, active: false, windowId });
      return tab.id;
    }, { url: bookmark.url, windowId });

    await ensureGroup(session.worker, windowId, tabId, step.space);
    await storeAssociation(session.worker, windowId, tabId, `bookmark-${bookmark.id}`);

    // Calling chrome.runtime.sendMessage from WITHIN the service worker
    // doesn't loop back to its own onMessage listener (no other context is
    // listening), so this can't reuse the real 'register-tab-space' message
    // handler the way a real sidebar would trigger it. Instead call the
    // DEV-only globalThis.__testHooks.registerTabSpace bridge (background.ts)
    // which invokes the exact same tabSpaceRegistry.register() the handler
    // would have called.
    await session.worker.evaluate(({ windowId, tabId, spaceId }) =>
    {
      globalThis.__testHooks.registerTabSpace(windowId, tabId, spaceId);
    }, { windowId, tabId, spaceId: space.id });

    if (step.as) refs[step.as] = { tabId, windowId };
  },

  async open_pinned_tab(session, refs, step)
  {
    const pinned = refs[step.pinned];
    const windowId = await currentWindowId(session.worker);

    const tabId = await session.worker.evaluate(async ({ url, windowId }) =>
    {
      const tab = await chrome.tabs.create({ url, active: false, windowId, pinned: true });
      return tab.id;
    }, { url: pinned.url, windowId });

    await storeAssociation(session.worker, windowId, tabId, `pinned-${pinned.id}`);

    if (step.as) refs[step.as] = { tabId, windowId };
  },

  async move_tab_to_group(session, refs, step)
  {
    const tab = refs[step.tab];
    await ensureGroup(session.worker, tab.windowId, tab.tabId, step.space);
  },

  async ungroup_tab(session, refs, step)
  {
    const tab = refs[step.tab];
    await session.worker.evaluate(async ({ tabId }) =>
    {
      await chrome.tabs.ungroup([tabId]);
    }, { tabId: tab.tabId });
  },

  async close_tab(session, refs, step)
  {
    const tab = refs[step.tab];
    await session.worker.evaluate(async ({ tabId }) =>
    {
      await chrome.tabs.remove(tabId);
    }, { tabId: tab.tabId });
  },

  async delete_bookmark(session, refs, step)
  {
    const bookmark = refs[step.bookmark];
    await session.worker.evaluate(async ({ id }) =>
    {
      await chrome.bookmarks.remove(id);
    }, { id: bookmark.id });
  },

  async close_sidebar(session)
  {
    await closeSidebar(session);
  },

  async open_sidebar(session)
  {
    await openSidebar(session);
  },

  async wait(_session, _refs, step)
  {
    await new Promise(r => setTimeout(r, step.ms ?? 500));
  },
};

// --- Assertions (read state, throw on mismatch) ---

export const assertions = {

  async tab_in_space(session, refs, step)
  {
    const tab = refs[step.tab];
    const actualGroupTitle = await session.worker.evaluate(async ({ tabId }) =>
    {
      const t = await chrome.tabs.get(tabId);
      if (!t.groupId || t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;
      const group = await chrome.tabGroups.get(t.groupId);
      return group.title ?? null;
    }, { tabId: tab.tabId });

    if (actualGroupTitle !== step.space)
    {
      throw new Error(`expected tab "${step.tab}" to be in space "${step.space}", but its group title is "${actualGroupTitle}"`);
    }
  },

  async tab_ungrouped(session, refs, step)
  {
    const tab = refs[step.tab];
    const groupId = await session.worker.evaluate(async ({ tabId }) =>
    {
      const t = await chrome.tabs.get(tabId);
      return t.groupId;
    }, { tabId: tab.tabId });

    if (groupId && groupId !== -1)
    {
      throw new Error(`expected tab "${step.tab}" to be ungrouped, but it has groupId ${groupId}`);
    }
  },

  async bookmark_loaded(session, refs, step)
  {
    const bookmark = refs[step.bookmark];
    const tab = refs[step.windowFrom ?? step.tab];
    const windowId = tab ? tab.windowId : await currentWindowId(session.worker);

    const isLoaded = await session.worker.evaluate(async ({ windowId, bookmarkId }) =>
    {
      const key = `tabAssociations_${windowId}`;
      const associations = (await chrome.storage.session.get(key))[key] || {};
      const itemKey = `bookmark-${bookmarkId}`;
      return Object.values(associations).includes(itemKey);
    }, { windowId, bookmarkId: bookmark.id });

    const expected = step.expected ?? true;
    if (isLoaded !== expected)
    {
      throw new Error(`expected bookmark "${step.bookmark}" loaded=${expected}, but got loaded=${isLoaded}`);
    }
  },

  async pinned_loaded(session, refs, step)
  {
    const pinned = refs[step.pinned];
    const tab = refs[step.windowFrom ?? step.tab];
    const windowId = tab ? tab.windowId : await currentWindowId(session.worker);

    const isLoaded = await session.worker.evaluate(async ({ windowId, pinnedId }) =>
    {
      const key = `tabAssociations_${windowId}`;
      const associations = (await chrome.storage.session.get(key))[key] || {};
      const itemKey = `pinned-${pinnedId}`;
      return Object.values(associations).includes(itemKey);
    }, { windowId, pinnedId: pinned.id });

    const expected = step.expected ?? true;
    if (isLoaded !== expected)
    {
      throw new Error(`expected pinned "${step.pinned}" loaded=${expected}, but got loaded=${isLoaded}`);
    }
  },
};
