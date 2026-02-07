export interface UndoableAction
{
  description: string;
  do: () => Promise<void>;
  undo: () => Promise<void>;
}
