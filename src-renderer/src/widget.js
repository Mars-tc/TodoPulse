import { createApp } from 'vue'
import WidgetApp from './WidgetApp.vue'
import ToastHost from './components/ToastHost.vue'
import './styles/index.css'

createApp(WidgetApp).mount('#widget')

// 悬浮窗内也会 pushToast（如勾选完成提示），必须挂上宿主才能显示
const toastRoot = document.getElementById('toast-root')
if (toastRoot) createApp(ToastHost).mount(toastRoot)
