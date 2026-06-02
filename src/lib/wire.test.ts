import { describe, expect, it } from 'vitest'
import {
  projectFromWire,
  projectToWire,
  purchaseFromWire,
  purchasePatchToWire,
  purchaseToWire,
  type ProjectOut,
  type PurchaseOut,
} from './wire'

describe('projectFromWire', () => {
  it('round-trips required fields and converts area to number', () => {
    const wire: ProjectOut = {
      id: 'p1',
      user_id: 'u1',
      name: '保利和光屿湖',
      address: '北京市朝阳区',
      area: '88.5',
      type: '毛坯',
      start_date: '2026-01-01',
      expected_end_date: null,
      created_at: '2026-01-02T00:00:00Z',
    }
    const p = projectFromWire(wire)
    expect(p.id).toBe('p1')
    expect(p.name).toBe('保利和光屿湖')
    expect(p.area).toBe(88.5)
    expect(p.type).toBe('毛坯')
    expect(p.startDate).toBe('2026-01-01')
    expect(p.expectedEndDate).toBeUndefined()
    expect(p.createdAt).toBe('2026-01-02T00:00:00Z')
  })

  it('normalizes nulls to undefined and handles missing area', () => {
    const p = projectFromWire({
      id: 'p2',
      user_id: 'u1',
      name: 'X',
      address: null,
      area: null,
      type: null,
      start_date: null,
      expected_end_date: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(p.address).toBeUndefined()
    expect(p.area).toBeUndefined()
    expect(p.type).toBeUndefined()
    expect(p.startDate).toBeUndefined()
  })
})

describe('projectToWire', () => {
  it('emits null for missing optional fields (server wants null, not undefined)', () => {
    const out = projectToWire({ name: 'X' })
    expect(out.name).toBe('X')
    expect(out.address).toBeNull()
    expect(out.area).toBeNull()
    expect(out.type).toBeNull()
    expect(out.start_date).toBeNull()
    expect(out.expected_end_date).toBeNull()
  })
})

describe('purchaseFromWire', () => {
  it('coerces stringified numerics from the JSON Numeric columns', () => {
    const wire: PurchaseOut = {
      id: 'pu1',
      project_id: 'p1',
      node_id: 'n1',
      name: '瓷砖',
      spec: '800x800',
      brand: '马可波罗',
      channel: '天猫',
      category: '主材',
      unit_price: '120.50',
      quantity: '12',
      total_price: '1446.00',
      purchase_date: '2026-02-01',
      purchase_url: 'https://example.com',
      remark: null,
      created_at: '2026-02-01T03:04:05Z',
    }
    const p = purchaseFromWire(wire)
    expect(p.unitPrice).toBe(120.5)
    expect(p.quantity).toBe(12)
    expect(p.totalPrice).toBe(1446)
    expect(p.remark).toBeUndefined()
  })

  it('treats a null node_id as empty string', () => {
    const p = purchaseFromWire({
      id: 'pu2',
      project_id: 'p1',
      node_id: null,
      name: 'x',
      spec: null,
      brand: null,
      channel: null,
      category: '其他',
      unit_price: 0,
      quantity: 0,
      total_price: 0,
      purchase_date: null,
      purchase_url: null,
      remark: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(p.nodeId).toBe('')
    expect(p.purchaseDate).toBeUndefined()
  })
})

describe('purchaseToWire / purchasePatchToWire', () => {
  it('maps camelCase → snake_case and converts undefined → null on create', () => {
    const wire = purchaseToWire({
      nodeId: 'n1',
      name: '马桶',
      spec: undefined,
      brand: 'TOTO',
      channel: undefined,
      category: '卫浴',
      unitPrice: 2000,
      quantity: 1,
      totalPrice: 2000,
      purchaseDate: '2026-02-02',
      purchaseUrl: undefined,
      remark: undefined,
    })
    expect(wire.node_id).toBe('n1')
    expect(wire.spec).toBeNull()
    expect(wire.brand).toBe('TOTO')
    expect(wire.channel).toBeNull()
    expect(wire.unit_price).toBe(2000)
    expect(wire.purchase_date).toBe('2026-02-02')
  })

  it('patch only includes the keys that changed', () => {
    const patch = purchasePatchToWire({ quantity: 2 })
    expect(patch).toEqual({ quantity: 2 })
  })

  it('patch translates an empty nodeId to null so server can clear it', () => {
    const patch = purchasePatchToWire({ nodeId: '' })
    expect(patch.node_id).toBeNull()
  })
})
