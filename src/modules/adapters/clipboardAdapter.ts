export async function withClipboardText<T>(text: string, action: () => Promise<T>): Promise<T> {
  await navigator.clipboard.writeText(text)
  return action()
}
