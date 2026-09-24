/**
 * composables/useUi.js
 * 跨组件共享的 UI 状态（如扩展指南弹窗），避免深层事件透传
 */
import { ref } from 'vue'

export const extensionGuideOpen = ref(false)

export function openExtensionGuide() {
  extensionGuideOpen.value = true
}
