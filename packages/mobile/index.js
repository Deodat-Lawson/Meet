/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { registerGlobals } from 'react-native-webrtc';
import App from './App';
import { name as appName } from './app.json';

// Installs RTCPeerConnection, MediaStream, MediaStreamTrack and navigator.mediaDevices
// onto the global scope. mediasoup-client and the shared room engine are written
// against the standard Web APIs, so this has to run before either is imported.
registerGlobals();

AppRegistry.registerComponent(appName, () => App);
