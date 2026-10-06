import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalize, config } from '../../src/main-node'
import { assertMatchCloseTo } from '../helpers'

/** 町字ごとの番地データ（CSV の 1 行 = 配列）。座標は省略可 */
type Rows = (string | number)[][]

/** CSV 1 セクション（`種別,町字名` + ヘッダ行 + データ行）を作る */
function section(kind: '住居表示' | '地番', town: string, rows: Rows): string {
  const header =
    kind === '住居表示'
      ? 'blk_num,rsdt_num,rsdt_num2,lng,lat'
      : 'prc_num1,prc_num2,prc_num3,lng,lat'
  const body = rows.map((r) => r.join(',')).join('\n')
  return `${kind},${town}\n${header}\n${body}\n`
}

/**
 * 1 町字ぶんのデータ定義。
 * rsdtRows / chibanRows が無ければ、その種別のデータは持たない。
 */
type TownDef = {
  id: string
  name: string
  rsdt?: true
  rsdtRows?: Rows
  chibanRows?: Rows
}

/**
 * テスト用の最小のミラーを作る（ネットワーク不要）。
 * 1 つの市区町村（東京都テスト市）に町字を並べ、CSV のバイト範囲（csv_ranges）を実測して JSON に書く。
 */
async function buildMirror(dir: string, towns: TownDef[]) {
  const prefDir = path.join(dir, 'ja', '東京都')
  await fs.promises.mkdir(prefDir, { recursive: true })
  const ja = {
    meta: { updated: 1 },
    data: [
      {
        code: 130001,
        pref: '東京都',
        pref_k: 'トウキョウト',
        pref_r: 'Tokyo',
        point: [139.69, 35.68],
        cities: [
          {
            code: 139999,
            city: 'テスト市',
            city_k: 'テストシ',
            city_r: 'Test-shi',
            point: [139.5, 35.6],
          },
        ],
      },
    ],
  }
  await fs.promises.writeFile(path.join(dir, 'ja.json'), JSON.stringify(ja))

  let rsdtCsv = ''
  let chibanCsv = ''
  const data = towns.map((t) => {
    const csv_ranges: Record<string, { start: number; length: number }> = {}
    if (t.rsdtRows) {
      const sec = section('住居表示', t.name, t.rsdtRows)
      csv_ranges['住居表示'] = {
        start: Buffer.byteLength(rsdtCsv),
        length: Buffer.byteLength(sec),
      }
      rsdtCsv += sec
    }
    if (t.chibanRows) {
      const sec = section('地番', t.name, t.chibanRows)
      csv_ranges['地番'] = {
        start: Buffer.byteLength(chibanCsv),
        length: Buffer.byteLength(sec),
      }
      chibanCsv += sec
    }
    return {
      machiaza_id: t.id,
      oaza_cho: t.name,
      ...(t.rsdt ? { rsdt: true } : {}),
      point: [139.5, 35.6],
      csv_ranges,
    }
  })
  await fs.promises.writeFile(
    path.join(prefDir, 'テスト市.json'),
    JSON.stringify({ meta: { updated: 1 }, data }),
  )
  await fs.promises.writeFile(
    path.join(prefDir, 'テスト市-住居表示.txt'),
    rsdtCsv,
  )
  await fs.promises.writeFile(
    path.join(prefDir, 'テスト市-地番.txt'),
    chibanCsv,
  )
}

describe('地番フォールバック（allowParcelFallback）', () => {
  let tmpdir: string
  const originalApi = config.japaneseAddressesApi

  before(async () => {
    tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nja-parcel-'))
    await buildMirror(tmpdir, [
      // A 型: 住居表示を実施していない町。データ側の rsdt 印が false（印なし）で、地番データだけを持つ
      {
        id: '0000001',
        name: '地番町',
        chibanRows: [[10, 1, '', 139.51, 35.61]],
      },
      // B 型: 本物の住居表示の町。住居表示データ（6-10-1 = 街区 6・号 10-1）を持つ。
      // 地番データには別の土地として 10-1 がある（「6-10-1」を地番に読むと別の土地に当たる）
      {
        id: '0000002',
        name: '住居町',
        rsdt: true,
        rsdtRows: [[6, 10, 1, 139.52, 35.62]],
        chibanRows: [[10, 1, '', 139.99, 35.99]],
      },
      // B 型（住居表示データなし）。印は rsdt だが号のデータが無く、地番データだけある
      {
        id: '0000003',
        name: '無号町',
        rsdt: true,
        chibanRows: [[3, 4, '', 139.53, 35.63]],
      },
    ])
    config.japaneseAddressesApi = `file://${tmpdir}/ja`
  })

  after(async () => {
    config.japaneseAddressesApi = originalApi
    await fs.promises.rm(tmpdir, { recursive: true, force: true })
  })

  describe('A 型（印が正しい地番の町）', () => {
    test('オプションなしの通常経路で level 8、addrSource は付かない', async () => {
      const res = await normalize('東京都テスト市地番町10-1')
      assertMatchCloseTo(res, {
        town: '地番町',
        addr: '10-1',
        other: '',
        level: 8,
      })
      assert.strictEqual(res.addrSource, undefined)
    })

    test('オプションを有効にしても結果は同じ', async () => {
      const res = await normalize('東京都テスト市地番町10-1', {
        allowParcelFallback: true,
      })
      assertMatchCloseTo(res, { addr: '10-1', level: 8 })
      assert.strictEqual(res.addrSource, undefined)
    })
  })

  describe('B 型（住居表示の町）', () => {
    test('既定では地番を引かず level 3 で止まる', async () => {
      const res = await normalize('東京都テスト市無号町3-4')
      assertMatchCloseTo(res, { town: '無号町', other: '3-4', level: 3 })
      assert.strictEqual(res.addr, undefined)
      assert.strictEqual(res.addrSource, undefined)
    })

    test('有効にすると地番に当たるが level は 3 のまま、addrSource は parcel-unverified', async () => {
      const res = await normalize('東京都テスト市無号町3-4', {
        allowParcelFallback: true,
      })
      assertMatchCloseTo(res, {
        town: '無号町',
        addr: '3-4',
        other: '',
        level: 3,
        addrSource: 'parcel-unverified',
        // 地番に座標があれば point は地番から埋まる
        point: { level: 8 },
      })
      assert.ok(res.metadata.chiban)
      assert.strictEqual(res.metadata.rsdt, undefined)
    })

    test('住居表示データに当たるときは住居表示が優先され level 8、地番の同じ数列は無視する', async () => {
      const res = await normalize('東京都テスト市住居町6-10-1', {
        allowParcelFallback: true,
      })
      assertMatchCloseTo(res, { addr: '6-10-1', level: 8 })
      assert.strictEqual(res.addrSource, undefined)
      assert.ok(res.metadata.rsdt)
      assert.strictEqual(res.metadata.chiban, undefined)
    })

    test('住居表示データには無く地番の数列に偶然一致しても level 8 を名乗らない', async () => {
      // 「10-1」は住居表示では街区 10・号 1 の意味で、住居表示データには無い。地番 10-1 は別の土地
      const res = await normalize('東京都テスト市住居町10-1', {
        allowParcelFallback: true,
      })
      assert.strictEqual(res.level, 3)
      assert.strictEqual(res.addrSource, 'parcel-unverified')
    })

    test('地番データにも無い番号は採用しない', async () => {
      const res = await normalize('東京都テスト市無号町99-9', {
        allowParcelFallback: true,
      })
      assert.strictEqual(res.level, 3)
      assert.strictEqual(res.addr, undefined)
      assert.strictEqual(res.addrSource, undefined)
    })
  })
})
