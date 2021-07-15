import { invokeHook } from '@dcloudio/uni-core'
import { formatLog } from '@dcloudio/uni-shared'
import {
  ComponentPublicInstance,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
} from 'vue'
import { VuePageComponent } from './define'
import { addCurrentPage } from './getCurrentPages'

export function setupPage(component: VuePageComponent) {
  const oldSetup = component.setup
  component.inheritAttrs = false // 禁止继承 __pageId 等属性，避免告警
  component.setup = (_, ctx) => {
    const {
      attrs: { __pageId, __pagePath, __pageQuery, __pageInstance },
    } = ctx
    if (__DEV__) {
      console.log(formatLog(__pagePath as string, 'setup'))
    }
    const instance = getCurrentInstance()!
    const pageVm = instance.proxy!
    pageVm.$page = __pageInstance as Page.PageInstance['$page']
    pageVm.$vm = pageVm
    addCurrentPage(initScope(__pageId as number, pageVm))
    invokeHook(pageVm, 'onLoad', __pageQuery)
    invokeHook(pageVm, 'onShow')
    onMounted(() => {
      invokeHook(pageVm, 'onReady')
      // TODO preloadSubPackages
    })
    onBeforeUnmount(() => {
      invokeHook(pageVm, 'onUnload')
    })
    if (oldSetup) {
      return oldSetup(__pageQuery as any, ctx)
    }
  }
  return component
}

function initScope(pageId: number, vm: ComponentPublicInstance) {
  const $getAppWebview = () => {
    return plus.webview.getWebviewById(pageId + '')
  }
  vm.$getAppWebview = $getAppWebview
  vm.$scope = {
    $getAppWebview,
  }
  return vm
}
