import type { AgentTarget } from "../modules/command-router/types"

export function TargetSelector(props: {
  targets: AgentTarget[]
  activeTargetId: string
  onChange: (targetId: string) => void
}) {
  return (
    <select
      className="h-8 min-w-32 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-800 outline-none focus:border-neutral-400"
      value={props.activeTargetId}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.targets.map((target) => (
        <option key={target.id} value={target.id}>
          {target.name}
        </option>
      ))}
    </select>
  )
}
