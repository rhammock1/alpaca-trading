/*
 * A collection of functions used across the different examples.
 */

const log = require('./log');
const MINUTE = 60000;

/**
 * @description Do nothing until the market opens.
 * @param {Instance} alpaca 
 * @param {Date} ttc - Time to close
 * @returns 
 */
async function awaitMarketOpen(alpaca, ttc) {
  let time_to_close = ttc;
  return new Promise((resolve) => {
    const check = async () => {
      try {
        const clock = await alpaca.getClock();
        if(clock.is_open) {
          resolve(time_to_close);
        } else {
          const open_time = new Date(clock.next_open.substring(0, clock.next_close.length - 6));
          const current_time = new Date(clock.timestamp.substring(0, clock.timestamp.length - 6));

          time_to_close = Math.floor((open_time - current_time) / 1000 / 60);
          log('info', `${time_to_close} minutes till the market opens again.`);
          setTimeout(check, MINUTE);
        }
      } catch(err) {
        log('error', 'Error while waiting for the market to open.', err.error);
      }
    };
    check();
  });
}

module.exports = {awaitMarketOpen};
