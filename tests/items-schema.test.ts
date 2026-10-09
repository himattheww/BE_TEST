import { describe, expect, it } from 'vitest';
import { itemInputSchema, processItemsSchema } from '../src/schemas/items';

const projectId = '0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10';

const validItem = {
  item_code: 'A-001',
  description: 'Excavation',
  volume: 12.5,
  unit: 'm3',
  unit_price: 150000,
};

describe('itemInputSchema', () => {
  it('accepts a valid item', () => {
    expect(itemInputSchema.safeParse(validItem).success).toBe(true);
  });

  it('treats unit as optional', () => {
    const { unit: _unit, ...withoutUnit } = validItem;

    expect(itemInputSchema.safeParse(withoutUnit).success).toBe(true);
  });

  it('drops a client supplied total_price', () => {
    const result = itemInputSchema.parse({ ...validItem, total_price: 1 });

    expect(result).not.toHaveProperty('total_price');
  });

  it.each([
    ['a missing volume', { volume: undefined }],
    ['a missing unit_price', { unit_price: undefined }],
    ['volume as a string', { volume: '12.5' }],
    ['null volume', { volume: null }],
    ['zero volume', { volume: 0 }],
    ['negative volume', { volume: -1 }],
    ['volume with more than 4 decimals', { volume: 0.00001 }],
    ['volume above the maximum', { volume: 1_000_000_001 }],
    ['unit_price as a string', { unit_price: '100' }],
    ['null unit_price', { unit_price: null }],
    ['negative unit_price', { unit_price: -100 }],
    ['unit_price with more than 2 decimals', { unit_price: 33.335 }],
    ['blank item_code', { item_code: '   ' }],
    ['missing description', { description: undefined }],
  ])('rejects %s', (_label, override) => {
    expect(itemInputSchema.safeParse({ ...validItem, ...override }).success).toBe(false);
  });

  it('accepts a zero unit_price', () => {
    expect(itemInputSchema.safeParse({ ...validItem, unit_price: 0 }).success).toBe(true);
  });
});

describe('processItemsSchema', () => {
  it('accepts a valid payload', () => {
    expect(processItemsSchema.safeParse({ project_id: projectId, items: [validItem] }).success).toBe(true);
  });

  it('rejects an empty items array', () => {
    expect(processItemsSchema.safeParse({ project_id: projectId, items: [] }).success).toBe(false);
  });

  it('rejects a missing project_id', () => {
    expect(processItemsSchema.safeParse({ items: [validItem] }).success).toBe(false);
  });

  it('rejects a project_id that is not a uuid', () => {
    expect(processItemsSchema.safeParse({ project_id: '123', items: [validItem] }).success).toBe(false);
  });
});
