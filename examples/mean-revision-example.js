/*
 * This is a slightly modified example from https://github.com/alpacahq/alpaca-trade-api-js/blob/master/examples/mean-reversion.js
 */

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('../utils/log');
const {
  awaitMarketOpen,
  cancelExistingOrders,
  getMarketClose,
} = require('../utils');
const CONFIG = require('../stock_config.json');

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
      usePolygon: USE_POLYGON,
    });

    this.running_average = 0;
    this.last_order = null;
    this.time_to_close = null;
    this.current_price = null;

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
          await this.submitMarketOrder(qty, 'sell');
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
      log('error', 'Error while getting position in rebalance.', err, err.response, err.config, err.toJSON());
    }

    // Get the new updated prices and running average
    await this.getRunningAverage();

    if(this.current_price > this.runningAverage) {
      // Sell our position if the price is above the running average
      if(position_qty > 0) {
        log('info', {stock: this.stock}, 'Price is above running average. Selling position.');
        await this.submitLimitOrder(position_qty, 'sell');
      } else {
        log('info', {stock: this.stock}, 'No position in the stock. No action taken.');
      }
    } else if(this.current_price < this.running_average) {
      // Determine optimal amount of shares based on portfolio and market data
      let portfolio_value = 0;
      let buying_power = 0;
      try {
        const account = await this.alpaca.getAccount();
        ({portfolio_value, buying_power} = account);
      } catch(err) {
        log('error', 'Error while getting account details in rebalance', err);
      }
      const portfolio_share = ((this.running_average - this.current_price) / this.current_price) * 200;
      const target_position_value = portfolio_value * portfolio_share;
      let amount_to_add = target_position_value - position_value;

      // Add to our position, constrained by our buying power. Or, sell down to optimal amount of shares
      const expression = add => Math.floor(add / this.current_price);
      if(amount_to_add > 0) {
        if(amount_to_add > buying_power) {
          amount_to_add = buying_power;
        }
        const quantity_to_buy = expression(amount_to_add);
        await this.submitLimitOrder(quantity_to_buy, 'buy');
      } else {
        amount_to_add *= -1;
        const quantity_to_sell = expression(amount_to_add) > position_qty
          ? position_qty
          : expression(amount_to_add);
        await this.submitLimitOrder(quantity_to_sell, 'sell');
      }
    }
  }

  /**
   * @description Submit a limit order if quantity is above 0.
   * @param {number} qty - quantity of shares to buy or sell
   * @param {string} side - buy or sell
   */
  async submitLimitOrder(qty, side) {
    const log_details = {stock: this.stock, quantity: qty, side};
    if(qty > 0) {
      try {
        const order = await this.alpaca.createOrder({
          symbol: this.stock,
          qty,
          side,
          type: 'limit',
          time_in_force: 'day',
          limit_price: this.current_price,
        });
        log('info', log_details, 'Limit order completed.');
        this.last_order = order;
      } catch(err) {
        log('error', log_details, 'Error while submitting limit order.', err);
      }
    } else {
      log('warn', log_details, 'Quantity is less than or equal to 0. Not submitting order.');
    }
  }

  /**
   * @description Submit a market order if quantity is above 0.
   * @param {number} qty - quantity of shares to buy or sell
   * @param {string} side - buy or sell
   */
  async submitMarketOrder(qty, side) {
    const log_details = {stock: this.stock, quantity: qty, side};
    if(qty > 0) {
      try {
        const order = await this.alpaca.createOrder({
          symbol: this.stock,
          qty,
          side,
          type: 'market',
          time_in_force: 'day',
        });
        log('info', log_details, 'Market order completed.');
        this.last_order = order;
      } catch(err) {
        log('error', log_details, 'Error while submitting market order.', err);
      }
    } else {
      log('warn', log_details, 'Quantity is less than or equal to 0. Not submitting order.');
    }
  }
}

const run = () => {
  log('warn', 'Running Mean Revision Example');
  if(!CONFIG?.stocks?.length) {
    log('error', 'Please create a "./stock_config.json" file and insert an array of stock symbols to continue.');
    return;
  }
  log('debug', `Creating new Mean Revision Example with stocks ${CONFIG.stocks}`);
  // DEBUG
  const meanRevisionExample = new MeanRevision(
    {keyId: APCA_API_KEY_ID, secretKey: APCA_API_SECRET_KEY, stock: CONFIG.stocks[0]},
  );
  log('debug', `Initailizing Mean Revision Example for ${CONFIG.stocks[0]}.`);
  meanRevisionExample.run();
  // for(const stock of CONFIG.stocks) {
  //   const meanRevisionExample = new MeanRevision({keyId: APCA_API_KEY_ID, secretKey: APCA_API_SECRET_KEY, stock});
  //   const index = CONFIG.stocks.indexOf(stock) + 1;
  //   // I don't know if this is actually necessary, but it prevents the examples from running at the same time
  //   // A second delay between each stock
  //   const timeout = setTimeout(() => {
  //     log('debug', `Initializing Mean Revision Example for ${stock}.`);
  //     meanRevisionExample.run();
  //     clearTimeout(timeout);
  //   }, index * 1000);
  // }
};

const name = () => 'Mean Revision Example';

module.exports = {run, name};
