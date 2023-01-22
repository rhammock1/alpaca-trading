/*
 * A collection of functions used across the different examples.
 */

const log = require('./log');
const MINUTE = 60000;

let alpaca;

/**
 * @description Assign the Alpaca instance to a global variable
 * @param {Instance} instance - Alpaca instance
 */
function cacheAlpacaInstance(instance) {
  if(instance) {
    alpaca = instance;
    log('debug', 'Successfully cached Alpaca instance');
  }
}

/**
 * @description Submit an order if quantity is above 0
 * @param {number} obj.quantity - amount of stock to purchase
 * @param {string} obj.stock - stock symbol
 * @param {string} obj.side - buy or sell
 * @param {string} obj.type - market or limit
 */
async function submitOrder({quantity, stock, side, type}) {
  log('debug', {quantity, stock, side}, 'Submitting order...');
  return new Promise(async (resolve) => {
    if(quantity <= 0) {
      log('info', {quantity, stock, side}, 'Quantity is less than 0. Market order not sent.');
      resolve(true);
      return;
    }

    try {
      await alpaca.createOrder({
        symbol: stock,
        qty: quantity,
        side,
        type,
        time_in_force: 'day',
      });
      log('info', {quantity, stock, side}, 'Market order completed.');
      resolve(true);
    } catch(err) {
      log('error', {quantity, stock, side}, 'Market order failed.');
      resolve(false);
    }
  });
}

/**
 * @description Do nothing until the market opens.
 * @param {Instance} alpaca 
 * @param {Date} ttc - Time to close
 * @returns 
 */
async function awaitMarketOpen(ttc) {
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
async function cancelExistingOrders() {
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
async function getMarketClose() {
  let time_to_close;
  try {
    const clock = await alpaca.getClock();
    const closing_time = new Date(clock.next_close.substring(0, clock.next_close.length - 6));
    const current_time = new Date(clock.timestamp.substring(0, clock.timestamp.length - 6));
    time_to_close = Math.abs(closing_time - current_time);
  } catch(err) {
    log('error', 'Error getting the market close.', err.error);
  }
  return time_to_close;
}

/**
 * @description Keep the script running every minute
 * @param {fn} run - parent function
 * @param {fn} rebalance -
 */
async function spin(run, rebalance) {
  const interval = setInterval(async () => {
    // Figure out when the market will close so we can prepare to sell beforehand
    try {
      this.time_to_close = await getMarketClose();
    } catch(err) {
      log('error', 'Error while getting market close time.', err);
    }

    const INTERVAL = 15; // minutes

    if(this.time_to_close < (MINUTE * INTERVAL)) {
      // Close all positions when there are 15 minutes till market close
      log('info', 'The market is closing soon. Closing positions.');

      try {
        const positions = await alpaca.getPositions();

        await Promise.all(positions.map(p => submitOrder({
          quantity: Math.abs(p.qty),
          stock: p.symbol,
          type: 'market',
          side: p.side === 'long' ? 'sell' : 'buy',
        })));
      } catch(err) {
        log('error', 'Error while closing positions before market close.', err.error);
      }

      clearInterval(interval);
      log('info', `Sleeping until market close (${INTERVAL} minutes).`);

      setTimeout(() => {
        // Run script again after market close for the next trading day
        run();
      }, MINUTE * INTERVAL);
    } else {
      // Rebalance the portfolio
      await rebalance();
    }
  }, MINUTE);
}

module.exports = {
  awaitMarketOpen,
  cancelExistingOrders,
  getMarketClose,
  submitOrder,
  cacheAlpacaInstance,
  spin,
};
