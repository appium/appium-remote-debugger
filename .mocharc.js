module.exports = {
  'node-option': ['import=ts-node/esm'],
  forbidOnly: Boolean(process.env.CI)
};
