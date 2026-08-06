/**
 * Bridge for the screen-share picker window.
 *
 * The meeting UI itself needs nothing from Electron — it is the same web app
 * that runs in a browser — so nothing is exposed to that origin. Only the
 * picker, which is a local file we ship, gets an API surface.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('meetPicker', {
  list: () => ipcRenderer.invoke('picker:sources'),
  choose: (id: string | null) => ipcRenderer.send('picker:choose', id),
});
