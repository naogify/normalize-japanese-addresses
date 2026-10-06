import { describe, test } from 'node:test'
import assert from 'node:assert'
import { normalize } from '../../src/main-node'
import { distanceMeters } from '../../src/lib/utils'
import { assertMatchCloseTo } from '../helpers'

describe('親番号が無く子番号だけがある地番（allowParentOfChildren）', () => {
  test('既定では従来どおり level 3 で止まる', async () => {
    const res = await normalize('愛知県瀬戸市效範町2丁目72')
    assertMatchCloseTo(res, { town: '效範町二丁目', other: '72', level: 3 })
    assert.strictEqual(res.addr, undefined)
    assert.strictEqual(res.addrSource, undefined)
    assert.strictEqual(res.metadata.parentOfChildren, undefined)
  })

  test('有効にすると親番号を level 8 で返し、子番号の重心を point にする', async () => {
    const res = await normalize('愛知県瀬戸市效範町2丁目72', {
      allowParentOfChildren: true,
    })
    assertMatchCloseTo(res, {
      town: '效範町二丁目',
      addr: '72',
      other: '',
      level: 8,
      addrSource: 'parent-of-children',
      point: { level: 8 },
    })
    // 子番号（72-1 など）が 3 件。重心なので町字の代表点とは別の座標になる
    assert.strictEqual(res.metadata.parentOfChildren?.count, 3)
    assert.ok((res.metadata.parentOfChildren?.spreadMeters ?? Infinity) < 100)
    assert.ok(res.point)
  })

  test('子番号に座標が無いときは親番号を返すが、point は町字の代表点のまま', async () => {
    const res = await normalize('京都府京都市東山区五条橋東6丁目541', {
      allowParentOfChildren: true,
    })
    assertMatchCloseTo(res, {
      addr: '541',
      level: 8,
      addrSource: 'parent-of-children',
      point: { level: 3 },
    })
    assert.strictEqual(res.metadata.parentOfChildren?.spreadMeters, null)
  })

  test('子番号の座標が 1 km 以上散らばるときは採用しない', async () => {
    // 松代町清野の 1 は子番号 10 件が約 1.3 km に散らばる
    const res = await normalize('長野県長野市松代町清野1', {
      allowParentOfChildren: true,
    })
    assert.strictEqual(res.level, 3)
    assert.strictEqual(res.addr, undefined)
    assert.strictEqual(res.addrSource, undefined)
  })

  test('親番号そのものが地番データにあるときは完全一致が優先され addrSource は付かない', async () => {
    const res = await normalize('神奈川県横浜市港北区大豆戸町17番地11', {
      allowParentOfChildren: true,
    })
    assertMatchCloseTo(res, { addr: '17-11', level: 8 })
    assert.strictEqual(res.addrSource, undefined)
  })

  test('どちらも無い番号は採用しない', async () => {
    const res = await normalize('愛知県瀬戸市效範町2丁目99999', {
      allowParentOfChildren: true,
    })
    assert.strictEqual(res.level, 3)
    assert.strictEqual(res.addr, undefined)
  })
})

describe('distanceMeters', () => {
  test('同じ点は 0 m', () => {
    assert.strictEqual(distanceMeters([139.7, 35.6], [139.7, 35.6]), 0)
  })

  test('緯度 1 度は約 111 km', () => {
    const d = distanceMeters([139.7, 35], [139.7, 36])
    assert.ok(Math.abs(d - 111_195) < 200, `${d}`)
  })
})
