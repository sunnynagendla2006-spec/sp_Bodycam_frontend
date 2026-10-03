import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react'

export default function Battery({ percent, charging = false }) {
  if (percent == null) return <span className="whitespace-nowrap text-ink-400">Not available</span>
  let Icon = BatteryFull
  let tone = 'text-signal-green'
  if (charging) Icon = BatteryCharging
  else if (percent <= 15) {
    Icon = BatteryWarning
    tone = 'text-signal-red'
  } else if (percent <= 30) {
    Icon = BatteryLow
    tone = 'text-signal-amber'
  } else if (percent <= 70) {
    Icon = BatteryMedium
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className={`h-[18px] w-[18px] ${tone}`} aria-hidden="true" />
      <span className="tabular-nums">{percent}%</span>
      {charging && <span className="text-xs text-ink-500">charging</span>}
    </span>
  )
}
