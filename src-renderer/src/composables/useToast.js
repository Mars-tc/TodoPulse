/**
 * composables/useToast.js
 * 全局轻提示队列（含「撤销」动作支持）
 */
import { ref } from 'vue';

export const toasts = ref([]);
let seq = 0;

/**
 * 推送一条提示
 * @param {Object} options
 *  - message: 文本
 *  - type: 'info' | 'success' | 'error'
 *  - duration: 毫秒（有 action 时默认 6000）
 *  - actionLabel / onAction: 可选操作按钮（如「撤销」）
 */
export function pushToast(options = {}) {
  const {
    message = '',
    type = 'info',
    duration,
    actionLabel = '',
    onAction = null
  } = options;

  const id = ++seq;
  const item = {
    id,
    message,
    type,
    actionLabel,
    onAction,
    duration: duration || (onAction ? 6000 : 2600)
  };
  toasts.value = [...toasts.value, item];

  setTimeout(() => removeToast(id), item.duration);
  return id;
}

export function removeToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function useToast() {
  return {
    toasts,
    success: (message, opts = {}) => pushToast({ ...opts, message, type: 'success' }),
    error: (message, opts = {}) => pushToast({ ...opts, message, type: 'error' }),
    info: (message, opts = {}) => pushToast({ ...opts, message, type: 'info' }),
    remove: removeToast
  };
}
