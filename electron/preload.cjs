/**
 * 预加载：只给网页暴露一个很小的「侧栏浏览器」桥。
 * 网页仍然拿不到 node、拿不到 electron，只有下面这几个方法。
 */
const { contextBridge, ipcRenderer } = require('electron')

const cmd = (payload) => ipcRenderer.send('biu:browser:cmd', payload)

contextBridge.exposeInMainWorld('biuBrowser', {
  /** 外壳在不在（网页版里就是 undefined） */
  available: true,
  navigate: (url) => cmd({ type: 'navigate', url }),
  back: () => cmd({ type: 'back' }),
  forward: () => cmd({ type: 'forward' }),
  reload: () => cmd({ type: 'reload' }),
  stop: () => cmd({ type: 'stop' }),
  bounds: (rect) => cmd({ type: 'bounds', rect }),
  visible: (visible) => cmd({ type: 'visible', visible }),
  openExternal: (url) => cmd({ type: 'openExternal', url }),
  inspect: (x, y) => cmd({ type: 'inspect', x, y }),
  cancelInspect: () => cmd({ type: 'cancelInspect' }),
  close: () => cmd({ type: 'close' }),
  onState: (fn) => {
    const h = (_e, payload) => fn(payload)
    ipcRenderer.on('biu:browser:state', h)
    return () => ipcRenderer.removeListener('biu:browser:state', h)
  },
  onError: (fn) => {
    const h = (_e, payload) => fn(payload)
    ipcRenderer.on('biu:browser:error', h)
    return () => ipcRenderer.removeListener('biu:browser:error', h)
  },
  onInspected: (fn) => {
    const h = (_e, payload) => fn(payload)
    ipcRenderer.on('biu:browser:inspected', h)
    return () => ipcRenderer.removeListener('biu:browser:inspected', h)
  },
})
