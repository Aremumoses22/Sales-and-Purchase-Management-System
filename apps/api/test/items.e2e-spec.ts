import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ItemDto, ItemListItemDto, Paginated, StockMovementDto, TaxDto } from '@spms/shared';
import { API, createTestApp, signIn, signInAsRole, unique, type Agent } from './helpers.js';

describe('Items and stock (e2e)', () => {
  let app: NestExpressApplication;
  let admin: Agent;
  let tax: TaxDto;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signIn(app);
    tax = (await admin.post(`${API}/settings/taxes`).send({ name: unique('Sales Tax'), rate: '7.5' }).expect(201)).body;
  });

  afterAll(async () => {
    await app.close();
  });

  const goods = (name: string) => ({
    type: 'goods',
    name,
    sku: name.replace(/\s+/g, '-').toUpperCase(),
    unit: 'pcs',
    sellingPrice: '125.00',
    salesDescription: 'Sold by the piece',
    costPrice: '80',
    taxId: tax.id,
    trackInventory: true,
    openingStock: '10',
    reorderLevel: '4',
  });

  it('creates a tracked goods item with opening stock', async () => {
    const name = unique('Widget');
    const item = (await admin.post(`${API}/items`).send(goods(name)).expect(201)).body as ItemDto;

    expect(item).toMatchObject({
      type: 'goods',
      name,
      sellingPrice: '125.00',
      costPrice: '80.00',
      trackInventory: true,
      stockOnHand: '10',
      reorderLevel: '4',
      isActive: true,
    });
    expect(item.tax).toMatchObject({ id: tax.id, rate: '7.5' });

    const movements = (await admin.get(`${API}/items/${item.id}/stock-movements`).expect(200)).body as StockMovementDto[];
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'opening', quantity: '10', reason: 'Opening stock' });
  });

  it('creates a service item without inventory', async () => {
    const item = (
      await admin
        .post(`${API}/items`)
        .send({ type: 'service', name: unique('Installation'), sellingPrice: '90', trackInventory: false })
        .expect(201)
    ).body as ItemDto;
    expect(item).toMatchObject({ type: 'service', trackInventory: false, stockOnHand: null, reorderLevel: null });
  });

  it('rejects inventory tracking on a service', async () => {
    const res = await admin
      .post(`${API}/items`)
      .send({ type: 'service', name: unique('Bad service'), trackInventory: true })
      .expect(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'trackInventory' });
  });

  it('refuses duplicate names, duplicate SKUs and unknown taxes', async () => {
    const name = unique('Gadget');
    const created = (await admin.post(`${API}/items`).send(goods(name)).expect(201)).body as ItemDto;

    const duplicateName = await admin.post(`${API}/items`).send({ ...goods(unique('Other')), name: name.toLowerCase() }).expect(400);
    expect(duplicateName.body.error.details[0]).toMatchObject({ path: 'name' });

    const duplicateSku = await admin.post(`${API}/items`).send({ ...goods(unique('Third')), sku: created.sku }).expect(400);
    expect(duplicateSku.body.error.details[0]).toMatchObject({ path: 'sku' });

    const badTax = await admin
      .post(`${API}/items`)
      .send({ ...goods(unique('Fourth')), sku: null, taxId: '0199b5a0-0000-7000-8000-00000000beef' })
      .expect(400);
    expect(badTax.body.error.details).toEqual([{ path: 'taxId', message: 'Select a valid tax' }]);
  });

  it('adjusts stock up and down but never below zero', async () => {
    const item = (await admin.post(`${API}/items`).send(goods(unique('Bolt'))).expect(201)).body as ItemDto;
    const adjust = (quantityChange: string) =>
      admin.post(`${API}/items/${item.id}/stock-adjustments`).send({ date: '2026-09-16', quantityChange, reason: 'Stock count' });

    expect(((await adjust('5').expect(201)).body as ItemDto).stockOnHand).toBe('15');
    expect(((await adjust('-12').expect(201)).body as ItemDto).stockOnHand).toBe('3');

    const tooMuch = await adjust('-4').expect(400);
    expect(tooMuch.body.error.details).toEqual([
      { path: 'quantityChange', message: 'Stock on hand cannot go below zero (currently 3)' },
    ]);
    expect(((await admin.get(`${API}/items/${item.id}`).expect(200)).body as ItemDto).stockOnHand).toBe('3');

    const zero = await adjust('0').expect(400);
    expect(zero.body.error.code).toBe('VALIDATION_ERROR');

    const movements = (await admin.get(`${API}/items/${item.id}/stock-movements`).expect(200)).body as StockMovementDto[];
    expect(movements.map((movement) => movement.quantity)).toEqual(['-12', '5', '10']);

    const history = (await admin.get(`${API}/items/${item.id}/history`).expect(200)).body as { action: string }[];
    expect(history.filter((entry) => entry.action === 'stock_adjusted')).toHaveLength(2);
  });

  it('refuses stock adjustments for items without inventory tracking', async () => {
    const item = (
      await admin.post(`${API}/items`).send({ type: 'service', name: unique('Consulting'), sellingPrice: '200' }).expect(201)
    ).body as ItemDto;
    const res = await admin
      .post(`${API}/items/${item.id}/stock-adjustments`)
      .send({ date: '2026-09-16', quantityChange: '1', reason: 'Nope' })
      .expect(409);
    expect(res.body.error.code).toBe('INVENTORY_NOT_TRACKED');
  });

  it('cannot turn tracking off once stock has been recorded', async () => {
    const item = (await admin.post(`${API}/items`).send(goods(unique('Nut'))).expect(201)).body as ItemDto;
    const res = await admin
      .put(`${API}/items/${item.id}`)
      .send({ ...goods(item.name), sku: item.sku, trackInventory: false })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'trackInventory', message: 'Inventory tracking cannot be turned off after stock has been recorded' },
    ]);
  });

  it('updates an item and lists it with filters', async () => {
    const name = unique('Sprocket');
    const item = (await admin.post(`${API}/items`).send(goods(name)).expect(201)).body as ItemDto;

    const updated = (
      await admin.put(`${API}/items/${item.id}`).send({ ...goods(name), sellingPrice: '149.99', taxId: null }).expect(200)
    ).body as ItemDto;
    expect(updated).toMatchObject({ sellingPrice: '149.99', tax: null, stockOnHand: '10' });

    const list = (await admin.get(`${API}/items`).query({ q: name, type: 'goods' }).expect(200))
      .body as Paginated<ItemListItemDto>;
    expect(list.data.map((row) => row.id)).toContain(item.id);
    expect(list.data[0]).toMatchObject({ stockOnHand: '10', salesDescription: 'Sold by the piece' });

    const services = (await admin.get(`${API}/items`).query({ q: name, type: 'service' }).expect(200))
      .body as Paginated<ItemListItemDto>;
    expect(services.data).toHaveLength(0);

    await admin.post(`${API}/items/${item.id}/deactivate`).expect(200);
    const active = (await admin.get(`${API}/items`).query({ q: name }).expect(200)).body as Paginated<ItemListItemDto>;
    expect(active.data).toHaveLength(0);
  });

  it('keeps a tax that an item uses', async () => {
    const usedTax = (await admin.post(`${API}/settings/taxes`).send({ name: unique('VAT'), rate: '5' }).expect(201))
      .body as TaxDto;
    await admin.post(`${API}/items`).send({ ...goods(unique('Taxed')), taxId: usedTax.id }).expect(201);
    const res = await admin.delete(`${API}/settings/taxes/${usedTax.id}`).expect(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('deletes an item that has only opening stock, but keeps adjusted ones', async () => {
    const plain = (await admin.post(`${API}/items`).send(goods(unique('Throwaway'))).expect(201)).body as ItemDto;
    await admin.delete(`${API}/items/${plain.id}`).expect(204);
    await admin.get(`${API}/items/${plain.id}`).expect(404);

    const adjusted = (await admin.post(`${API}/items`).send(goods(unique('Kept'))).expect(201)).body as ItemDto;
    await admin
      .post(`${API}/items/${adjusted.id}/stock-adjustments`)
      .send({ date: '2026-09-16', quantityChange: '1', reason: 'Recount' })
      .expect(201);
    expect((await admin.delete(`${API}/items/${adjusted.id}`).expect(409)).body.error.code).toBe('ITEM_IN_USE');
  });

  it('only lets roles with the stock permission adjust stock', async () => {
    const item = (await admin.post(`${API}/items`).send(goods(unique('Guarded'))).expect(201)).body as ItemDto;
    const viewer = await signInAsRole(app, 'Viewer');
    await viewer.get(`${API}/items/${item.id}`).expect(200);
    await viewer
      .post(`${API}/items/${item.id}/stock-adjustments`)
      .send({ date: '2026-09-16', quantityChange: '1', reason: 'Nope' })
      .expect(403);
  });
});
