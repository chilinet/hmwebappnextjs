const schedule = require('node-schedule');
const { updateTokens } = require('./services/tokenRefreshService');

function startScheduler() {
  // Führt den Job alle 5 Minuten aus
  schedule.scheduleJob('*/1 * * * *', async function() {
    try {
      await updateTokens();
      console.log('Token refresh completed successfully');
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  });
}

module.exports = { startScheduler }; 