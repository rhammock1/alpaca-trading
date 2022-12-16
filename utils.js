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

/**
 * @description Cancels all open orders so they don't impact our buying power.
 * @param {Instance} alpaca
 */
async function cancelExistingOrders(alpaca) {
  let orders;
  try {
    log('debug', 'Canceling existing orders.');
    orders = await alpaca.getOrders({
      status: 'open',
      direction: 'desc',
    });
  } catch(err) {
    log('error', 'Error while getting orders.', err);
  }

  return Promise.all(orders.map(o => new Promise(async (resolve) => {
    try {
      await alpaca.cancelOrder(o.id);
    } catch(err) {
      log('error', 'Error while attempting to cancel orders.', err.error);
    }
    resolve();
  })));
}

/**
 * @description Gets the time until the market closes.
 * @param {Instance} alpaca 
 * @returns time_to_close
 */
async function getMarketClose(alpaca) {
  const clock = await alpaca.getClock();
  const closing_time = new Date(clock.next_close.substring(0, clock.next_close.length - 6));
  const current_time = new Date(clock.timestamp.substring(0, clock.timestamp.length - 6));
  const time_to_close = Math.abs(closing_time - current_time);
  return time_to_close;
}

module.exports = {
  awaitMarketOpen,
  cancelExistingOrders,
  getMarketClose,
};
