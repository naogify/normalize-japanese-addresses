import { describe, test } from 'node:test'
import assert from 'node:assert'
import { normalize } from '../../src/main-node'
import { assertMatchCloseTo } from '../helpers'

describe('住居表示の町字で入力が地番のとき（allowParcelFallback）', () => {
  test('既定では従来どおり level 3 で止まる', async () => {
    const res = await normalize('埼玉県越谷市南越谷1-2876-1')
    assertMatchCloseTo(res, {
      town: '南越谷一丁目',
      other: '2876-1',
      level: 3,
    })
    assert.strictEqual(res.addr, undefined)
    assert.strictEqual(res.addrSource, undefined)
  })

  test('有効にすると地番データの完全一致を level 8 で返し、addrSource は parcel', async () => {
    const res = await normalize('埼玉県越谷市南越谷1-2876-1', {
      allowParcelFallback: true,
    })
    assertMatchCloseTo(res, {
      town: '南越谷一丁目',
      addr: '2876-1',
      other: '',
      level: 8,
      addrSource: 'parcel',
    })
    // 地番レコードが metadata.chiban に入る
    assert.ok(res.metadata.chiban)
    assert.strictEqual(res.metadata.rsdt, undefined)
  })

  test('地番データに座標があれば point は level 8、無ければ町字の代表点のまま', async () => {
    // 座標の無い地番（南越谷一丁目 2876-1）
    const noPoint = await normalize('埼玉県越谷市南越谷1-2876-1', {
      allowParcelFallback: true,
    })
    assert.strictEqual(noPoint.level, 8)
    assert.strictEqual(noPoint.point?.level, 3)
    // 座標のある地番（老松町五丁目 629-1）
    const withPoint = await normalize('岡山県倉敷市老松町5丁目629-1', {
      allowParcelFallback: true,
    })
    assertMatchCloseTo(withPoint, {
      addr: '629-1',
      level: 8,
      addrSource: 'parcel',
      point: { level: 8 },
    })
  })

  test('住居表示に当たるときは住居表示が優先され addrSource は付かない', async () => {
    const res = await normalize('北海道札幌市西区24-2-2-3-3', {
      allowParcelFallback: true,
    })
    assertMatchCloseTo(res, {
      town: '二十四軒二条二丁目',
      addr: '3-3',
      level: 8,
    })
    assert.strictEqual(res.addrSource, undefined)
    assert.ok(res.metadata.rsdt)
    assert.strictEqual(res.metadata.chiban, undefined)
  })

  test('地番データにも無い番号は採用しない', async () => {
    const res = await normalize('埼玉県越谷市南越谷1-99999-9', {
      allowParcelFallback: true,
    })
    assert.strictEqual(res.level, 3)
    assert.strictEqual(res.addr, undefined)
    assert.strictEqual(res.addrSource, undefined)
  })

  test('地番の町字では有効にしても挙動が変わらない', async () => {
    const res = await normalize('神奈川県横浜市港北区大豆戸町17番地11', {
      allowParcelFallback: true,
    })
    assertMatchCloseTo(res, { addr: '17-11', level: 8 })
    assert.strictEqual(res.addrSource, undefined)
  })
})
