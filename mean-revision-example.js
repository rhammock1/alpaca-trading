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
    const getRunningAverage = async () => {
      const bar_checker = setInterval(async () => {
        try {
          const response = await this.alpaca.getCalendar(Date.now());
          const market_open = response[0].open;
          const resp = await this.alpaca.getBars('minute', this.stock, {start: market_open});
          const bars = resp[this.stock];
          if(bars.length >= 20) {
            log('debug', {stock: this.stock}, 'Got 20 bars.');
            this.runningAverage = 0;
            for(const bar of bars) {
              this.runningAverage += bar.closePrice;
            }
            this.runningAverage /= 20;
            log('debug', {stock: this.stock}, `Running average is ${this.runningAverage}`);
            clearInterval(bar_checker);
          }
        } catch(err) {
          log('error', 'Error while getting bars for running average.', err);
        }
      }, 60000);
    };
    log('info', 'Getting running average.');
    await getRunningAverage();

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
    }, MINUTE * 15);
  }

  async rebalance() {}

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
