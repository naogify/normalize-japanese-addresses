import { describe, test } from 'node:test'
import assert from 'node:assert'
import { normalize } from '../../src/main-node'
import { assertMatchCloseTo } from '../helpers'

describe('丁目の省略（丁目の記号なしの数字だけ）の解釈', () => {
  // 町名に漢数字（一〜十）の文字を含む町字でも、丁目の省略パターンが生成される
  const kanjiNamedTowns: [string, string][] = [
    ['東京都新宿区四谷1', '四谷一丁目'],
    ['東京都港区三田1', '三田一丁目'],
    ['東京都港区六本木1', '六本木一丁目'],
    ['東京都千代田区九段南1', '九段南一丁目'],
  ]
  for (const [input, town] of kanjiNamedTowns) {
    test(`${input} は ${town} になる`, async () => {
      const res = await normalize(input)
      assertMatchCloseTo(res, { town, level: 3, other: '' })
    })
  }

  test('町名に漢数字を含まない町字は従来どおり丁目の省略を解釈する', async () => {
    const res = await normalize('東京都港区赤坂1')
    assertMatchCloseTo(res, { town: '赤坂一丁目', level: 3, other: '' })
  })

  test('町名の後ろに 4 桁の番地が続くとき、先頭 1 桁を丁目と誤認しない', async () => {
    // 「総社1130-2」を「総社一丁目」+「130-2」と読んではいけない
    const res = await normalize('群馬県前橋市総社1130-2')
    assert.ok(
      !/丁目$/.test(res.town ?? ''),
      `丁目に誤認している: ${res.town} / ${res.other}`,
    )
    assert.notStrictEqual(res.other, '130-2')
  })

  test('町名の後ろに 3 桁の番地が続くとき、先頭 1 桁を丁目と誤認しない', async () => {
    // 「御経塚206」を「御経塚二丁目」+「06」と読んではいけない
    const res = await normalize('石川県野々市市御経塚206')
    assert.ok(
      !/丁目$/.test(res.town ?? ''),
      `丁目に誤認している: ${res.town} / ${res.other}`,
    )
    assert.notStrictEqual(res.other, '06')
  })

  test('丁目の省略と番地の区切りがハイフンのときは従来どおり丁目として読む', async () => {
    const res = await normalize('東京都港区三田1-2-3')
    assertMatchCloseTo(res, { town: '三田一丁目', level: 3, other: '2-3' })
  })
})

describe('0 始まりの番地', () => {
  test('広島県呉市海岸3丁目02番16号 は先頭の 0 を落として 2-16 を探す', async () => {
    const res = await normalize('広島県呉市海岸3丁目02番16号')
    assertMatchCloseTo(res, {
      town: '海岸三丁目',
      addr: '2-16',
      other: '',
      level: 8,
    })
  })

  test('値が 0 の番地は番地として読まない', async () => {
    const res = await normalize('広島県呉市海岸3丁目00番16号')
    assert.strictEqual(res.level, 3)
    assert.strictEqual(res.addr, undefined)
  })
})
