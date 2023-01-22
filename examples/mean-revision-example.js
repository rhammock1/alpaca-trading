/*
 * This is a slightly modified example from https://github.com/alpacahq/alpaca-trade-api-js/blob/master/examples/mean-reversion.js
 */

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('../utils/log');
const {
  awaitMarketOpen,
  cancelExistingOrders,
  cacheAlpacaInstance,
  submitOrder,
  spin,
} = require('../utils');
const CONFIG = require('../config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY, NODE_ENV} = process.env;
const USE_POLYGON = false;

const AVERAGE_DIVISOR = 20;

class MeanRevision {
  constructor({keyId, secretKey, paper = true}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
      usePolygon: USE_POLYGON,
    });

    this.running_average = {};
    this.last_order = {};
    this.time_to_close = null;
    this.current_price = {};

    this.stocks = CONFIG.stocks;

    cacheAlpacaInstance(this.alpaca);
  }

  async run() {
    // First cancel any existing orders so they don't impact our buying power.
    await cancelExistingOrders(this.alpaca);

    // Wait for market to open.
    log('info', 'Waiting for market to open.');
    this.time_to_close = await awaitMarketOpen(this.alpaca, this.time_to_close);
    log('info', 'Market opened.');
    
    log('info', 'Getting running average.');
    await Promise.all(this.stocks.map(stock => this.getRunningAverage(stock)));

    await spin(this.run.bind(this), this.rebalance.bind(this));
  }

  /**
   * @description Get the running average of the selected stock
   */
  async getRunningAverage(stock) {
    const bar_checker = setInterval(async () => {
      try {
        const response = await this.alpaca.getCalendar(Date.now());
        const market_open = response[0].open;
        const resp = await this.alpaca.getBars('minute', this.stock, {start: market_open, limit: AVERAGE_DIVISOR});
        const bars = resp[stock];
        if(bars.length >= AVERAGE_DIVISOR) {
          log('debug', {stock}, 'Got bars.');
          this.runningAverage[stock] = 0;
          this.current_price[stock] = bars[bars.length - 1].closePrice;
          for(const bar of bars) {
            this.runningAverage[stock] += bar.closePrice;
          }
          clearInterval(bar_checker);
          this.runningAverage[stock] /= AVERAGE_DIVISOR;
          log('debug', {stock}, `Running average for ${stock} is ${this.runningAverage[stock]}`);
        }
      } catch(err) {
        log('error', {stock}, 'Error while getting bars for running average.', err);
      }
    }, 60000);
  }

  /**
   * @description Rebalance our position after an update
   */
  async rebalance() {
    let positions;

    // Get our position, if any
    try {
      positions = await this.alpaca.getPositions();
    } catch(err) {
      log('error', 'Error while getting position in rebalance.', err, err.response, err.config, err.toJSON());
    }

    // Get the new updated prices and running average
    await Promise.all(this.stocks.map(stock => this.getRunningAverage(stock)));

    await Promise.all(positions.map(async (position) => {
      const {symbol: stock, qty, market_value} = position;
      if(this.current_price[stock] > this.runningAverage[stock]) {
        // Sell our position if the price is above the running average
        if(qty > 0) {
          log('info', {stock}, 'Price is above running average. Selling position.');
          await submitOrder({quantity: qty, stock, type: 'limit', side: 'sell'});
        } else {
          log('info', {stock}, 'No position in the stock. No action taken.');
        }
      } else if(this.current_price[stock] < this.running_average[stock]) {
        // Determine optimal amount of shares based on portfolio and market data
        let portfolio_value = 0;
        let buying_power = 0;
        try {
          const account = await this.alpaca.getAccount();
          ({portfolio_value, buying_power} = account);
        } catch(err) {
          log('error', 'Error while getting account details in rebalance', err);
        }
        const portfolio_share = (
          (this.running_average[stock] - this.current_price[stock]) / this.current_price[stock]) * 200;
        const target_position_value = portfolio_value * portfolio_share;
        let amount_to_add = target_position_value - market_value;

        // Add to our position, constrained by our buying power. Or, sell down to optimal amount of shares
        const expression = add => Math.floor(add / this.current_price[stock]);
        if(amount_to_add > 0) {
          if(amount_to_add > buying_power) {
            amount_to_add = buying_power;
          }
          const quantity_to_buy = expression(amount_to_add);
          await submitOrder({qty: quantity_to_buy, stock, type: 'limit', side: 'buy'});
        } else {
          amount_to_add *= -1;
          const quantity_to_sell = expression(amount_to_add) > qty
            ? qty
            : expression(amount_to_add);
          await submitOrder({quantity: quantity_to_sell, stock, type: 'limit', side: 'sell'});
        }
      }
    }));
  }
}

const run = () => {
  log('warn', 'Running Mean Revision Example');
  if(!CONFIG?.stocks?.length) {
    log('error', 'Please create a "config.json" file in the root directory and insert an array of stock symbols to continue.');
    return;
  }
  log('debug', `Creating new Mean Revision Example with stocks ${CONFIG.stocks}`);
  const meanRevisionExample = new MeanRevision({
    keyId: APCA_API_KEY_ID,
    secretKey: APCA_API_SECRET_KEY,
    paper: NODE_ENV !== 'production', // only use live trading in production
  });
  meanRevisionExample.run();
};

const name = () => 'Mean Revision Example';

module.exports = {run, name};
