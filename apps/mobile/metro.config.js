const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && (moduleName === 'isows' || moduleName.startsWith('zustand'))) {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  if (platform !== 'web' && moduleName === 'jose') {
    return context.resolveRequest({ ...context, unstable_conditionNames: ['browser'] }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
