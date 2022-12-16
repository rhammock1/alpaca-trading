/*
 * This is a slightly modified example from https://github.com/alpacahq/alpaca-trade-api-js/blob/master/examples/mean-reversion.js
 */

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('./log');
const {
  awaitMarketOpen,
  cancelExistingOrders,
  getMarketClose,
} = require('./utils');
const CONFIG = require('./stock_config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY} = process.env;
const USE_POLYGON = false;

const MINUTE = 60000;
const AVERAGE_DIVISOR = 20;

class MeanRevision {
  constructor({keyId, secretKey, paper = true, stock}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
    });

    this.running_average = 0;
    this.last_order = null;
    this.time_to_close = null;
    this.current_price = null;

    // For example purposes
    this.stock = stock;
  }

  async run() {
    // First cancel any existing orders so they don't impact our buying power.
    await cancelExistingOrders(this.alpaca);

    // Wait for market to open.
    log('info', 'Waiting for market to open.');
    this.time_to_close = await awaitMarketOpen(this.alpaca, this.time_to_close);
    log('info', 'Market opened.');

    // Get the running average of prices of the last 20 minutes, waiting until we have 20 bars from the market.
    
    log('info', 'Getting running average.');
    await this.getRunningAverage();

    // Rebalance the portfolio every minute based off of the running average.
    const spin = setInterval(async () => {
      // Clear the last order so that we only have 1 hanging order.
      if(this.last_order !== null) {
        await this.alpaca.cancelOrder(this.last_order.id)
          .catch(err => log('error', 'Error while canceling order in spin.', err));
      }

      // Figure out when the market will close so we can prepare to sell beforehand.
      try {
        this.time_to_close = await getMarketClose(this.alpaca);
      } catch(err) {
        log('error', 'Error getting the market close.', err.error);
      }

      if(this.time_to_close < (15 * MINUTE)) {
        // Close all positions when 15 minutes til market close.
        log('info', 'Market closing soon.  Closing positions.');
        try {
          const position = await this.alpaca.getPosition(this.stock);
          const {qty} = position;
          await this.submitMarketOrder(qty, this.stock, 'sell');
        } catch(err) {
          log('error', 'Error while closing positions.', err);
        }
        clearInterval(spin);
        console.log('Sleeping until market close (15 minutes).');
        setTimeout(() => {
          // Run script again after market close for next trading day.
          this.run();
        }, 15 * MINUTE);
      } else {
        // Rebalance the portfolio.
        await this.rebalance();
      }
    }, MINUTE);
  }

  /**
   * @description Get the running average of the selected stock
   */
  async getRunningAverage() {
    const bar_checker = setInterval(async () => {
      try {
        const response = await this.alpaca.getCalendar(Date.now());
        const market_open = response[0].open;
        const resp = await this.alpaca.getBars('minute', this.stock, {start: market_open, limit: AVERAGE_DIVISOR});
        const bars = resp[this.stock];
        if(bars.length >= AVERAGE_DIVISOR) {
          log('debug', {stock: this.stock}, 'Got bars.');
          this.runningAverage = 0;
          this.current_price = bars[bars.length - 1].closePrice;
          for(const bar of bars) {
            this.runningAverage += bar.closePrice;
          }
          clearInterval(bar_checker);
          this.runningAverage /= AVERAGE_DIVISOR;
          log('debug', {stock: this.stock}, `Running average is ${this.runningAverage}`);
        }
      } catch(err) {
        log('error', 'Error while getting bars for running average.', err);
      }
    }, 60000);
  }

  /**
   * @description Rebalance our position after an update
   */
  async rebalance() {
    let position_qty = 0;
    let position_value = 0;

    // Get our position, if any
    try {
      const response = await this.alpaca.getPosition(this.stock);
      position_qty = response.qty;
      position_value = response.market_value;
    } catch(err) {
      log('error', 'Error while getting position in rebalance.', err);
    }

    // Get the new updated prices and running average
    await this.getRunningAverage();

    if(this.current_price > this.runningAverage) {
      // Sell our position if the price is above the running average
      if(position_qty > 0) {
        log('info', {stock: this.stock}, 'Price is above running average. Selling position.');
        await this.submitLimitOrder(position_qty, this.stock, this.current_price, 'sell');
      } else {
        log('info', {stock: this.stock}, 'No position in the stock. No action taken.');
      }
    } else if(this.current_price < this.running_average) {
      // Determine optimal amount of shares based on portfolio and market data
    }
  }

  async submitLimitOrder() {}

  async submitMarketOrder() {}
}

const meanRevisionExample = new MeanRevision({keyId: APCA_API_KEY_ID, secretKey: APCA_API_SECRET_KEY, stock: 'AAPL'});
const run = () => {
  log('warn', 'Running Mean Revision Example');
  // meanRevisionExample.run();
};

const name = () => 'Mean Revision Example';

module.exports = {run, name};
