import os from 'os'
import path from 'path'
import { kanji2number, findKanjiNumbers } from '@geolonia/japanese-numeral'
const tmpdir = path.join(os.tmpdir(), 'normalize-japanese-addresses')
const fetch = require('node-fetch-cache')(tmpdir)
import dict from './lib/dict'

const endpoint = 'https://cdn.geolonia.com/address/japan'

const kan2num = (string: string) => {
  const kanjiNumbers = findKanjiNumbers(string)
  for (let i = 0; i < kanjiNumbers.length; i++) {
    // @ts-ignore
    string = string.replace(kanjiNumbers[i], kanji2number(kanjiNumbers[i]))
  }

  return string
}

const zen2han = (str: string) => {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９ー]/g, (s) => {
    if ('ー' === s) {
      return '-'
    } else {
      return String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    }
  })
}

export const normalize = async (address: string) => {
  let addr = dict(zen2han(address))

  // 都道府県名の正規化

  const responsePrefs = await fetch(`${endpoint}.json`)
  const prefs = await responsePrefs.json()

  let pref = '' // 都道府県名
  for (let i = 0; i < prefs.length; i++) {
    const _pref = dict(prefs[i]).replace(/(都|道|府|県)$/, '') // `東京` の様に末尾の `都府県` が抜けた住所に対応
    const reg = new RegExp(`^${_pref}(都|道|府|県)`)
    if (addr.match(reg)) {
      pref = prefs[i]
      addr = addr.replace(reg, '') // 都道府県名以降の住所
      break
    }
  }

  if (!pref) {
    throw new Error("Can't detect the prefecture.")
  }

  // 市区町村名の正規化

  const responseCities = await fetch(`${endpoint}/${encodeURI(pref)}.json`)
  const cities = await responseCities.json()

  let city = '' // 市区町村名
  for (let i = 0; i < cities.length; i++) {
    if (0 === addr.indexOf(dict(cities[i]))) {
      city = cities[i]
      addr = addr.substr(cities[i].length) // 市区町村名以降の住所
      break
    } else {
      // 以下 `xxx郡` が省略されているケースに対する対応
      if (0 < cities[i].indexOf('郡')) {
        // `郡山` のように `郡` で始まる地名はスキップ
        const _city = cities[i].replace(/.+郡/, '')
        if (0 === addr.indexOf(dict(_city))) {
          city = cities[i]
          addr = addr.substr(_city.length) // 市区町村名以降の住所
          break
        }
      }
    }
  }

  if (!city) {
    throw new Error("Can't detect the city.")
  }

  // 町丁目以降の正規化

  const responseTowns = await fetch(
    `${endpoint}/${encodeURI(pref)}/${encodeURI(
      city.replace(/.+郡/, ''),
    )}.json`,
  )
  const towns = await responseTowns.json()

  addr = kan2num(addr) // 漢数字を数字に

  const units = '(丁目|丁|番町|条|軒|線|の町|号|地割|\-)'

  let town = ''
  for (let i = 0; i < towns.length; i++) {
    const reg = new RegExp(`[〇一二三四五六七八九十百千]+${units}`, 'g')
    const _town = dict(towns[i]).replace(reg, (s) => {
      return kan2num(s) // API からのレスポンスに含まれる `n丁目` 等の `n` を数字に変換する。
    })

    const regex = new RegExp(_town.replace(/([0-9]+)([^0-9]+)/g, `$1${units}`))

    if ('京都府' !== pref && addr.match(regex)) {
      town = kan2num(towns[i])
      addr = addr.replace(regex, '') // 町丁目以降の住所
      break
      // 京都の通り名は字が2回出てくるので最後だけ取得する。でもここは単に字が含まれるか見るだけ。
    } else if ('京都府' === pref && addr.match(regex)) {
      // 0 <= addr.lastIndexOf(_town)
      town = kan2num(towns[i])
      // ここの正規表現で、丁目以下をとれてない。通り名丁目を含んでる
      console.log({_town})
      // ここで、addr.lastIndexOf(_town)　を使って最後のindex出して、ぶん

      // 最後に出てきたキーワード以降を取得するという正規表現
      const reg = new RegExp(`^.*${_town}`)
      addr = addr.replace(reg, '') // 町丁目以降の住所
    }
  }

  if (!town) {
    throw new Error("Can't detect the town.")
  }

  return pref + city + town + addr
}
