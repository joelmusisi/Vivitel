/* eslint-env jest */
/* Native module stubs so App renders under Jest (no device runtime). */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('@react-native-firebase/messaging', () => {
  const off = () => {};
  return {
    AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2, EPHEMERAL: 3 },
    getMessaging: jest.fn(() => ({})),
    getToken: jest.fn(async () => 'test-token'),
    deleteToken: jest.fn(async () => {}),
    requestPermission: jest.fn(async () => 1),
    getInitialNotification: jest.fn(async () => null),
    onMessage: jest.fn(() => off),
    onTokenRefresh: jest.fn(() => off),
    onNotificationOpenedApp: jest.fn(() => off),
    setBackgroundMessageHandler: jest.fn(),
  };
});

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props, ref) => React.createElement(View, props));
  const Stub = props => React.createElement(View, props);
  return { __esModule: true, default: MapView, Marker: Stub, UrlTile: Stub, PROVIDER_DEFAULT: undefined };
});
