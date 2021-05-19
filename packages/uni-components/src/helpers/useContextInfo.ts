import { onMounted, getCurrentInstance } from 'vue'
import { useCurrentPageId } from '@dcloudio/uni-core'

type ContextType = 'canvas' | 'map' | 'video' | 'editor'

export interface ContextInfo {
  id: string
  type: ContextType
  page: number
}

export interface HTMLElementWithContextInfo extends HTMLElement {
  __uniContextInfo?: ContextInfo
}
let index = 0
export function useContextInfo() {
  const page = useCurrentPageId()
  const instance = getCurrentInstance()!
  const vm = instance.proxy!
  const type = vm.$options.name!.toLowerCase() as ContextType
  const id = (vm as any).id || `context${index++}`
  onMounted(() => {
    const el = vm.$el as HTMLElementWithContextInfo
    el.__uniContextInfo = {
      id,
      type,
      page,
    }
  })
  return `${page}.${type}.${id}`
}
export function getContextInfo(el: HTMLElement | HTMLElementWithContextInfo) {
  return (el as HTMLElementWithContextInfo).__uniContextInfo
}
