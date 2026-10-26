/**
 * @format
 */

import { enableScreens } from 'react-native-screens';

enableScreens();

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandler } from './src/notifications/push';

// Background/quit-state push delivery must be wired before the app component registers.
registerBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
