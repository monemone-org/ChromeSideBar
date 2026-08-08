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
