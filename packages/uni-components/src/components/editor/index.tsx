import { onMounted, Ref, ref, watch } from 'vue'
import QuillClass, {
  QuillOptionsStatic,
  EventEmitter,
  RangeStatic,
  StringMap,
} from 'quill'
import { useContextInfo, useSubscribe } from '@dcloudio/uni-components'
import { getRealPath } from '@dcloudio/uni-platform'
import { defineBuiltInComponent } from '../../helpers/component'
import { CustomEventTrigger, useCustomEvent } from '../../helpers/useEvent'
import {
  props as keyboardProps,
  emit as keyboardEmit,
  useKeyboard,
} from '../../helpers/useKeyboard'
import HTMLParser from '../../helpers/html-parser'
import * as formats from './formats'
import loadScript from './load-script'

type EDITOR_CHANGE = 'editor-change'
type SCROLL_BEFORE_UPDATE = 'scroll-before-update'
type SCROLL_OPTIMIZE = 'scroll-optimize'
type SCROLL_UPDATE = 'scroll-update'
type SELECTION_CHANGE = 'selection-change'
type TEXT_CHANGE = 'text-change'

interface QuillSelection {
  getRange: () => RangeStatic[]
  savedRange: RangeStatic
}
interface QuillHistory {
  undo: () => void
  redo: () => void
}
interface QuillExt extends QuillClass {
  selection: QuillSelection
  on: (
    eventName:
      | EDITOR_CHANGE
      | SCROLL_BEFORE_UPDATE
      | SCROLL_OPTIMIZE
      | SCROLL_UPDATE
      | SELECTION_CHANGE
      | TEXT_CHANGE,
    handler: Function
  ) => EventEmitter
  scrollIntoView: () => void
  history: QuillHistory
}
interface QuillOptionsStaticExt extends QuillOptionsStatic {
  toolbar?: boolean
}

interface WindowExt extends Window {
  Quill?: typeof QuillClass
  ImageResize?: any
}

function useQuill(
  props: {
    readOnly?: any
    placeholder?: any
    showImgSize?: any
    showImgToolbar?: any
    showImgResize?: any
  },
  rootRef: Ref<HTMLElement | null>,
  trigger: CustomEventTrigger
) {
  type ResizeModuleName = 'DisplaySize' | 'Toolbar' | 'Resize'
  let quillReady: boolean
  let skipMatcher: boolean
  let quill: QuillExt
  watch(
    () => props.readOnly,
    (value) => {
      if (quillReady) {
        quill.enable(!value)
        if (!value) {
          quill.blur()
        }
      }
    }
  )
  watch(
    () => props.placeholder,
    (value) => {
      if (quillReady) {
        quill.root.setAttribute('data-placeholder', value)
      }
    }
  )
  function html2delta(html: string) {
    const tags = [
      'span',
      'strong',
      'b',
      'ins',
      'em',
      'i',
      'u',
      'a',
      'del',
      's',
      'sub',
      'sup',
      'img',
      'div',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'ol',
      'ul',
      'li',
      'br',
    ]
    let content = ''
    let disable: boolean
    HTMLParser(html, {
      start: function (tag: string, attrs: any[], unary: boolean) {
        if (!tags.includes(tag)) {
          disable = !unary
          return
        }
        disable = false
        const arrts = attrs
          .map(({ name, value }) => `${name}="${value}"`)
          .join(' ')
        const start = `<${tag} ${arrts} ${unary ? '/' : ''}>`
        content += start
      },
      end: function (tag: string) {
        if (!disable) {
          content += `</${tag}>`
        }
      },
      chars: function (text: string) {
        if (!disable) {
          content += text
        }
      },
    })
    skipMatcher = true
    const delta = quill.clipboard.convert(content)
    skipMatcher = false
    return delta
  }
  function getContents() {
    const html = quill.root.innerHTML
    const text = quill.getText()
    const delta = quill.getContents()
    return {
      html,
      text,
      delta,
    }
  }
  let oldStatus: StringMap = {}
  function updateStatus(range?: RangeStatic) {
    const status = range ? quill.getFormat(range) : {}
    const keys = Object.keys(status)
    if (
      keys.length !== Object.keys(oldStatus).length ||
      keys.find((key) => status[key] !== oldStatus[key])
    ) {
      oldStatus = status
      trigger('statuschange', {} as Event, status)
    }
  }
  function initQuill(imageResizeModules: ResizeModuleName[]) {
    const Quill = (window as WindowExt).Quill as typeof QuillClass
    formats.register(Quill)
    const options: QuillOptionsStaticExt = {
      toolbar: false,
      readOnly: props.readOnly,
      placeholder: props.placeholder,
    }
    if (imageResizeModules.length) {
      Quill.register(
        'modules/ImageResize',
        (window as WindowExt).ImageResize.default
      )
      options.modules = {
        ImageResize: {
          modules: imageResizeModules,
        },
      }
    }
    const rootEl = rootRef.value as HTMLElement
    quill = new Quill(rootEl, options) as QuillExt
    const $el = quill.root
    const events = ['focus', 'blur', 'input']
    events.forEach((name) => {
      $el.addEventListener(name, ($event) => {
        if (name === 'input') {
          $event.stopPropagation()
        } else {
          trigger(name, $event, getContents())
        }
      })
    })
    quill.on('text-change', () => {
      trigger('input', {} as Event, getContents())
    })
    quill.on('selection-change', updateStatus)
    quill.on('scroll-optimize', () => {
      const range = quill.selection.getRange()[0]
      updateStatus(range)
    })
    quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      if (skipMatcher) {
        return delta
      }
      if (delta.ops) {
        delta.ops = delta.ops
          .filter(({ insert }) => typeof insert === 'string')
          .map(({ insert }) => ({ insert }))
      }
      return delta
    })
    quillReady = true
    trigger('ready', {} as Event, {})
  }
  onMounted(() => {
    const imageResizeModules: ResizeModuleName[] = []
    if (props.showImgSize) {
      imageResizeModules.push('DisplaySize')
    }
    if (props.showImgToolbar) {
      imageResizeModules.push('Toolbar')
    }
    if (props.showImgResize) {
      imageResizeModules.push('Resize')
    }
    const quillSrc =
      __PLATFORM__ === 'app'
        ? './__uniappquill.js'
        : 'https://unpkg.com/quill@1.3.7/dist/quill.min.js'
    loadScript((window as WindowExt).Quill, quillSrc, () => {
      if (imageResizeModules.length) {
        const imageResizeSrc =
          __PLATFORM__ === 'app'
            ? './__uniappquillimageresize.js'
            : 'https://unpkg.com/quill-image-resize-mp@3.0.1/image-resize.min.js'
        loadScript((window as WindowExt).ImageResize, imageResizeSrc, () => {
          initQuill(imageResizeModules)
        })
      } else {
        initQuill(imageResizeModules)
      }
    })
  })
  const id = useContextInfo()
  useSubscribe(
    (type: string, data: any) => {
      const { options, callbackId } = data
      let res
      let range: RangeStatic | undefined
      let errMsg
      if (quillReady) {
        const Quill = (window as WindowExt).Quill as typeof QuillClass
        switch (type) {
          case 'format':
            {
              let { name = '', value = false } = options
              range = quill.getSelection(true)
              let format = quill.getFormat(range)[name] || false
              if (
                ['bold', 'italic', 'underline', 'strike', 'ins'].includes(name)
              ) {
                value = !format
              } else if (name === 'direction') {
                value = value === 'rtl' && format ? false : value
                const align = quill.getFormat(range).align
                if (value === 'rtl' && !align) {
                  quill.format('align', 'right', 'user')
                } else if (!value && align === 'right') {
                  quill.format('align', false, 'user')
                }
              } else if (name === 'indent') {
                const rtl = quill.getFormat(range).direction === 'rtl'
                value = value === '+1'
                if (rtl) {
                  value = !value
                }
                value = value ? '+1' : '-1'
              } else {
                if (name === 'list') {
                  value = value === 'check' ? 'unchecked' : value
                  format = format === 'checked' ? 'unchecked' : format
                }
                value =
                  (format && format !== (value || false)) || (!format && value)
                    ? value
                    : !format
              }
              quill.format(name, value, 'user')
            }
            break
          case 'insertDivider':
            range = quill.getSelection(true)
            quill.insertText(range.index, '\n', 'user')
            quill.insertEmbed(range.index + 1, 'divider', true, 'user')
            quill.setSelection(range.index + 2, 0, 'silent')
            break
          case 'insertImage':
            {
              range = quill.getSelection(true)
              const {
                src = '',
                alt = '',
                width = '',
                height = '',
                extClass = '',
                data = {},
              } = options
              const path = getRealPath(src)
              quill.insertEmbed(range.index, 'image', path, 'user')
              const local = /^(file|blob):/.test(path) ? path : false
              quill.formatText(range.index, 1, 'data-local', local)
              quill.formatText(range.index, 1, 'alt', alt)
              quill.formatText(range.index, 1, 'width', width)
              quill.formatText(range.index, 1, 'height', height)
              quill.formatText(range.index, 1, 'class', extClass)
              quill.formatText(
                range.index,
                1,
                'data-custom',
                Object.keys(data)
                  .map((key) => `${key}=${data[key]}`)
                  .join('&')
              )
              quill.setSelection(range.index + 1, 0, 'silent')
            }
            break
          case 'insertText':
            {
              range = quill.getSelection(true)
              const { text = '' } = options
              quill.insertText(range.index, text, 'user')
              quill.setSelection(range.index + text.length, 0, 'silent')
            }
            break
          case 'setContents':
            {
              const { delta, html } = options
              if (typeof delta === 'object') {
                quill.setContents(delta, 'silent')
              } else if (typeof html === 'string') {
                quill.setContents(html2delta(html), 'silent')
              } else {
                errMsg = 'contents is missing'
              }
            }
            break
          case 'getContents':
            res = getContents()
            break
          case 'clear':
            quill.setText('')
            break
          case 'removeFormat':
            {
              range = quill.getSelection(true)
              const parchment = Quill.import('parchment')
              if (range.length) {
                quill.removeFormat(range.index, range.length, 'user')
              } else {
                Object.keys(quill.getFormat(range)).forEach((key) => {
                  if (parchment.query(key, parchment.Scope.INLINE)) {
                    quill.format(key, false)
                  }
                })
              }
            }
            break
          case 'undo':
            quill.history.undo()
            break
          case 'redo':
            quill.history.redo()
            break
          case 'blur':
            quill.blur()
            break
          case 'getSelectionText':
            range = quill.selection.savedRange
            res = { text: '' }
            if (range && range.length !== 0) {
              res.text = quill.getText(range.index, range.length)
            }
            break
          case 'scrollIntoView':
            quill.scrollIntoView()
            break
          default:
            break
        }
        updateStatus(range)
      } else {
        errMsg = 'not ready'
      }
      if (callbackId) {
        UniViewJSBridge.publishHandler('onEditorMethodCallback', {
          callbackId,
          data: Object.assign({}, res, {
            errMsg: `${type}:${errMsg ? 'fail ' + errMsg : 'ok'}`,
          }),
        })
      }
    },
    id,
    true
  )
}

const props = /*#__PURE__*/ Object.assign({}, keyboardProps, {
  id: {
    type: String,
    default: '',
  },
  readOnly: {
    type: [Boolean, String],
    default: false,
  },
  placeholder: {
    type: String,
    default: '',
  },
  showImgSize: {
    type: [Boolean, String],
    default: false,
  },
  showImgToolbar: {
    type: [Boolean, String],
    default: false,
  },
  showImgResize: {
    type: [Boolean, String],
    default: false,
  },
})

export default /*#__PURE__*/ defineBuiltInComponent({
  name: 'Editor',
  props,
  emit: ['ready', 'focus', 'blur', 'input', 'statuschange', ...keyboardEmit],
  setup(props, { emit }) {
    const rootRef: Ref<HTMLElement | null> = ref(null)
    const trigger = useCustomEvent(rootRef, emit)
    useQuill(props, rootRef, trigger)
    useKeyboard(props, rootRef, trigger)
    return () => {
      return <uni-editor ref={rootRef} id={props.id} class="ql-container" />
    }
  },
})
