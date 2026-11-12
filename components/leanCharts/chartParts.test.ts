import { describe, expect, it } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ChartLegend, ChartTooltipBox } from './chartParts';

/* Two compared runs may carry the same name, so their legend and tooltip labels repeat.
   The server renderer does not warn on duplicate keys, so read the keys off the element tree. */
type El = ReactElement<{ children?: ReactNode }>;
const childKeys = (node: ReactNode): Array<string | null> =>
  Children.toArray(node).flatMap(c => (isValidElement(c) ? [c.key] : []));
/** The list items: the children of the element at `path` (indices into each level's children). */
function itemKeys(root: El, path: number[]): Array<string | null> {
  let el: El = root;
  for (const i of path) el = Children.toArray(el.props.children)[i] as El;
  return Array.isArray(el.props.children) ? el.props.children.map((c: El) => c.key) : childKeys(el.props.children);
}

describe('chart parts with repeated labels', () => {
  it('the legend gives each item its own key', () => {
    const el = ChartLegend({ items: [
      { label: 'Class', color: 'red', kind: 'line' }, { label: 'Class', color: 'blue', kind: 'line' },
    ] }) as El;
    const keys = itemKeys(el, []);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('the tooltip gives each row its own key', () => {
    const el = ChartTooltipBox({ title: 'Batch 1', rows: [
      { label: 'Class', value: '$1.00' }, { label: 'Class', value: '$2.00' },
    ] }) as El;
    const keys = itemKeys(el, [1]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
