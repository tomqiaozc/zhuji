export function fmtMoney(n: number): string {
  if (!isFinite(n)) return '¥ 0'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `¥ ${sign}${abs.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}
