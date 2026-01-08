const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
      // This replaces the old cypress/plugins/index.js file
      return config
    },
    specPattern: 'cypress/integration/**/*.js',
    supportFile: 'cypress/support/index.js',
  },
})

