import { useTranslation } from "react-i18next"
import type { CommandItem, LocaleCode } from "../modules/command-router/types"

const categories = ["all", "skill", "project", "frontend", "code", "terminal", "docs", "backend"]

export function Sidebar(props: {
  activeCategory: string
  commands: CommandItem[]
  locale: LocaleCode
  onCategoryChange: (category: string) => void
}) {
  const { t } = useTranslation()
  const skillGroups = Array.from(
    new Set(
      props.commands
        .map((command) => command.skillGroup?.trim())
        .filter((group): group is string => Boolean(group)),
    ),
  )

  return (
    <nav className="flex w-28 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-neutral-50/80 p-2">
      {categories.map((category) => (
        <button
          className={[
            "rounded-md px-2 py-2 text-left text-xs font-medium transition",
            props.activeCategory === category
              ? "bg-neutral-950 text-white"
              : "text-neutral-600 hover:bg-white hover:text-neutral-950",
          ].join(" ")}
          key={category}
          onClick={() => props.onCategoryChange(category)}
          type="button"
        >
          {t(`categories.${category}`)}
        </button>
      ))}
      {skillGroups.length > 0 ? (
        <>
          <div className="mt-2 px-2 text-[10px] font-semibold uppercase text-neutral-400">
            {t("skills")}
          </div>
          {skillGroups.map((skillGroup) => {
            const category = `skill:${skillGroup}`
            return (
              <button
                className={[
                  "truncate rounded-md px-2 py-2 text-left text-xs font-medium transition",
                  props.activeCategory === category
                    ? "bg-neutral-950 text-white"
                    : "text-neutral-600 hover:bg-white hover:text-neutral-950",
                ].join(" ")}
                key={skillGroup}
                onClick={() => props.onCategoryChange(category)}
                title={skillGroup}
                type="button"
              >
                {skillGroup}
              </button>
            )
          })}
        </>
      ) : null}
    </nav>
  )
}
