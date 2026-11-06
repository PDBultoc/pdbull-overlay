export const MODULES = ['camchat', 'intro', 'alerts', 'matchbar'];
export const modulesFor = (scene) => (scene === 'casting' ? ['camchat', 'alerts', 'reactions'] : MODULES);
