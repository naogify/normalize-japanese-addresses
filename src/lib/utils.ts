import {
  SingleCity,
  SingleMachiAza,
  SinglePrefecture,
} from '@geolonia/japanese-addresses-v2'

export function removeCitiesFromPrefecture(
  pref: SinglePrefecture | undefined,
): Omit<SinglePrefecture, 'cities'> | undefined {
  if (!pref) {
    return undefined
  }

  const newPref: Omit<SinglePrefecture, 'cities'> & { cities?: SingleCity[] } =
    {
      ...pref,
    }
  delete newPref.cities
  return newPref
}

export function removeExtraFromMachiAza(
  machiAza: SingleMachiAza | undefined,
): Omit<SingleMachiAza, 'csv_ranges'> | undefined {
  if (!machiAza) {
    return undefined
  }

  const newMachiAza: SingleMachiAza = { ...machiAza }
  delete newMachiAza.csv_ranges
  return newMachiAza
}

/** 地球の半径（メートル） */
const EARTH_RADIUS_METERS = 6_371_008.8

/**
 * 2 点間の大円距離（メートル）を返す。
 *
 * @param a - 1 点目 `[経度, 緯度]`
 * @param b - 2 点目 `[経度, 緯度]`
 */
export function distanceMeters(
  a: [number, number],
  b: [number, number],
): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}
