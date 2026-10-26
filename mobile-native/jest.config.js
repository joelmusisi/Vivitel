module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // These packages ship untranspiled ES modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-[a-z-]+)?|@react-native(-community)?|@react-native-async-storage|@react-native-firebase|@react-native-vector-icons|@react-navigation)/)',
  ],
};
