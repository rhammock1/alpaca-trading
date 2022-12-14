/*
 * This is a slightly modified example from https://github.com/alpacahq/alpaca-trade-api-js/blob/master/examples/long-short.js
 */

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('./log');
const {awaitMarketOpen, cancelExistingOrders} = require('./utils');
const CONFIG = require('./stock_config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY} = process.env;
const USE_POLYGON = false;

const MINUTE = 60000;
const side_type = {BUY: 'buy', SELL: 'sell'};
const position_type = {LONG: 'long', SHORT: 'short'};

/**
 * @description Helper function used to turn the result of getBarsV2 into an array
 * @param {object} response
 */
const generatorToArray = async (response) => {
  const result = [];
  for await (const x of response) {
    result.push(x);
  }
  return result;
};

class LongShort {
  constructor({keyId, secretKey, paper = true, bucket_pct = 0.25}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
      usePolygon: USE_POLYGON,
    });

    if(!CONFIG?.stocks?.length) {
      log('error', 'Please create a "./stock_config.json" file and insert an array of stock symbols to continue.');
      return;
    }
    this.stock_list = CONFIG.stocks.map(i => ({name: i, pc: 0}));

    this.long = [];
    this.short = [];
    this.q_short = [];
    this.q_long = [];
    this.adjusted_q_long = null;
    this.adjusted_q_short = null;
    this.blacklist = new Set();
    this.long_amount = 0;
    this.short_amount = 0;
    this.time_to_close = null;
    this.bucket_pct = bucket_pct;
  }

  async run() {
    // First, cancel any existing orders so they don't impact our buying power
    await cancelExistingOrders(this.alpaca);

    // Wait for the market to open
    log('info', 'Waiting for market to open.');
    this.time_to_close = await awaitMarketOpen(this.alpaca, this.time_to_close);
    log('info', 'Market opened.');

    // Rebalance the portfolio every minute, making necessary trades
    const spin = setInterval(async () => {
      // Figure out when the market will close so we can prepare to sell beforehand
      try {
        const clock = await this.alpaca.getClock();
        const closing_time = new Date(clock.next_close.substring(0, clock.next_close.length - 6));
        const current_time = new Date(clock.timestamp.substring(0, clock.timestamp.length - 6));
        this.time_to_close = Math.abs(closing_time - current_time);
      } catch(err) {
        log('error', 'Error getting the market clock.', err.error);
      }

      const INTERVAL = 15; // minutes

      if(this.time_to_close < (MINUTE * INTERVAL)) {
        // Close all positions when there are 15 minutes till market close
        log('info', 'The market is closing soon. Closing positions.');

        try {
          const positions = await this.alpaca.getPositions();

          await Promise.all(positions.map(p => this.submitOrder({
            quantity: Math.abs(p.qty),
            stock: p.symbol,
            side: p.side === position_type.LONG ? side_type.SELL : side_type.BUY,
          })));
        } catch(err) {
          log('error', 'Error while closing positions before market close.', err.error);
        }

        clearInterval(spin);
        log('info', `Sleeping until market close (${INTERVAL} minutes).`);

        setTimeout(() => {
          // Run script again after market close for the next trading day
          this.run();
        }, MINUTE * INTERVAL);
      } else {
        // Rebalance the portfolio
        await this.rebalance();
      }
    }, MINUTE);
  }

  // TODO - Refactor this because there is some complex if statements and repeated logic throughout
  // Rebalance our position after an update
  async rebalance() {
    log('debug', 'Rebalancing...');
    await this.rerank();

    // Clear existing orders again.
    await cancelExistingOrders(this.alpaca);

    log(
      'info',
      this.long.length
        ? `We are taking a long position in: ${this.long.toString()}`
        : 'No long positions.',
    );
    log(
      'info',
      this.short.length
        ? `We are taking a short position in: ${this.short.toString()}`
        : 'No short positions.',
    );

    // Remove positions that are no longer in the short or long list, and make a list of positions that do not need to change
    // Adjust position quantities if needed
    let positions;
    try {
      positions = await this.alpaca.getPositions();
    } catch(err) {
      log('error', 'Error while getting positions in REBALANCE.', err.error);
    }

    const executed = {long: [], short: []};

    this.blacklist.clear();

    await Promise.all(positions.map(position => new Promise(async (resolve) => {
      const quantity = Math.abs(position.qty);
      const {symbol} = position;

      // Position is not in long list
      if(this.long.indexOf(symbol) < 0) {
        // Position is not in short list
        if(this.short.indexOf(symbol) < 0) {
          log('debug', 'Position is not in long or short list. Clearing position.', symbol);
          // Clear position
          try {
            await this.submitOrder({
              quantity,
              stock: symbol,
              side: position.side === position_type.LONG ? side_type.SELL : side_type.BUY,
            });
            resolve();
          } catch(err) {
            log('error', 'Error attempting to send order and clear position.', err.error);
          }
        } else if(position.side === position_type.LONG) { // Position in short list
          try {
            log('debug', 'Position is in short list. Clearing long position and short instead.', symbol);
            // Position changed from long to short. Clear long position and short instead
            await this.submitOrder({
              quantity,
              stock: symbol,
              side: side_type.SELL,
            });
            resolve();
          } catch(err) {
            log('error', 'Error attempting to send order and change from LONG to SHORT', err.error);
          }
        } else {
          log('debug', {symbol, quantity, q_short: this.q_short}, 'Position is in short list. Adjusting SHORT position.');
          // Position is not where we want it
          if(quantity !== this.q_short) {
            // Need to adjust position amount
            const diff = Number(quantity) - Number(this.q_short);
            try {
              await this.submitOrder({
                quantity: Math.abs(diff),
                stock: symbol,
                // buy = Too many short positions. Buy some back to rebalance
                // sell = Too little short positions. Sell some more
                side: diff > 0 ? side_type.BUY : side_type.SELL,
              });
            } catch(err) {
              log('error', 'Error attempting to send order when SHORT position is not where we want.', err.error);
            }
          }
          executed.short.push(symbol);
          this.blacklist.add(symbol);
          resolve();
        }
      } else if(position.side === position_type.SHORT) {
        log('debug', {symbol}, 'Position is in long list. Clearing short position and long instead.');
        // Position in LONG list
        // Position changed from short to long. Clear short position and long instead
        try {
          await this.submitOrder({
            quantity,
            stock: symbol,
            side: side_type.BUY,
          });
          resolve();
        } catch(err) {
          log('error', 'Error attempting to send order when changing from SHORT to LONG.', err.error);
        }
      } else {
        log('debug', {symbol, quantity, q_long: this.q_long}, 'Position is in long list. Adjusting LONG position.');
        // Position is not where we want it
        if(quantity !== this.q_long) {
          console.log('adjusting position', symbol, quantity, this.q_long);
          // Need to adjust position amount
          const diff = Number(quantity) - Number(this.q_long);
          // sell = Too many long positions. Sell some to rebalance
          // buy = Too little long positions. Buy some more
          const side = diff > 0 ? side_type.SELL : side_type.BUY;
          try {
            await this.submitOrder({
              quantity: Math.abs(diff),
              stock: symbol,
              side,
            });
          } catch(err) {
            log('error', 'Error attempting to send order when LONG position is not where we want.', err.error);
          }
        }
        executed.long.push(symbol);
        this.blacklist.add(symbol);
        resolve();
      }
    })));

    this.adjusted_q_long = -1;
    this.adjusted_q_short = -1;

    try {
      log('debug', 'Sending orders to remaining stocks in long and short list.');
      // Send orders to all remaining stocks in the long and short list
      const [long_orders, short_orders] = await Promise.all([
        this.sendBatchOrder({
          quantity: this.q_long,
          stocks: this.long,
          side: side_type.BUY,
        }),
        this.sendBatchOrder({
          quantity: this.q_short,
          stocks: this.short,
          side: side_type.SELL,
        }),
      ]);

      executed.long = long_orders.executed.slice();
      executed.short = short_orders.executed.slice();

      // Handle rejected/incomplete long orders
      if(long_orders.incomplete.length > 0 && long_orders.executed.length > 0) {
        log('debug', 'Long orders incomplete. Adjusting quantity.', this.long_amount);
        const prices = await this.getTotalPrice(long_orders.executed);
        const complete_total = prices.reduce((a, b) => a + b, 0);
        if(complete_total !== 0) {
          this.adjusted_q_long = Math.floor(this.long_amount / complete_total);
        }
      }

      // Handle rejected/incomplete short orders
      if(short_orders.incomplete.length > 0 && long_orders.executed.length > 0) {
        log('debug', 'Short orders incomplete. Adjusting quantity.', this.short_amount);
        const prices = await this.getTotalPrice(short_orders.executed);
        const complete_total = prices.reduce((a, b) => a + b, 0);
        if(complete_total !== 0) {
          this.adjusted_q_short = Math.floor(this.short_amount / complete_total);
        }
      }
    } catch(err) {
      log('error', 'Error attempting to send batch order.', err.error);
    }

    try {
      log('debug', 'Reordering stocks that did not throw an error.');
      // Reorder stocks that didn't throw an error so that the equity quota is reached.
      await new Promise(async (resolve) => {
        const all_promises = [];
        log('debug', 'Adjusted Q Long: ', this.adjusted_q_long);
        if(this.adjusted_q_long >= 0) {
          this.q_long = this.adjusted_q_long - this.q_long;
          all_promises.push(
            ...executed.long.map(stock => this.submitOrder({
              quantity: this.q_long,
              stock,
              side: side_type.BUY,
            })),
          );
        }

        log('debug', 'Adjusted Q Short: ', this.adjusted_q_short);
        if(this.adjusted_q_short >= 0) {
          this.q_short = this.adjusted_q_short - this.q_short;
          all_promises.push(
            ...executed.short.map(stock => this.submitOrder({
              quantity: this.q_short,
              stock,
              side: side_type.SELL,
            })),
          );
        }

        if(all_promises.length > 0) {
          await Promise.all(all_promises);
        }

        resolve();
      });
    } catch(err) {
      log('error', 'Error while reordering stocks.', err.error);
    }
  }

  /**
   * @description Mechanism to rank the stocks. The basis of the Long-Short Equity Strategy.
   * Ranks all stocks by percent change over the past 10 minutes (higher is better).
   */
  async rank() {
    log('debug', 'Ranking stocks...');
    await this.getPercentChanges();

    // Sort the stocks in place by the percent change field (marked by pc)
    this.stock_list.sort((a, b) => a.pc - b.pc);
  }

  /**
   * @description Reranks all stocks to adjust longs and shorts
   */
  async rerank() {
    log('debug', 'Ranking...');
    await this.rank();

    // Grabs the top and bottom bucket (according to percentage) of the sorted stock list
    // to get the long and short lists
    const bucket_size = Math.floor(this.stock_list.length * this.bucket_pct);

    this.short = this.stock_list.slice(0, bucket_size).map(i => i.name);
    this.long = this.stock_list.slice(this.stock_list.length - bucket_size).map(i => i.name);
    log('debug', 'Bucket size:', bucket_size);
    // Determine amount to long/short based on total stock price of each bucket.
    // Employs a 130-30 strategy
    try {
      const result = await this.alpaca.getAccount();
      const {equity} = result;

      this.short_amount = 0.30 * equity;
      this.long_amount = Number(this.short_amount) + Number(equity);
      log('debug', 'Short amount:', this.short_amount, 'Long amount:', this.long_amount, 'Equity:', equity);
    } catch(err) {
      log('error', 'Error while getting the account or long/short amounts.', err.error);
    }

    try {
      const long_prices = await this.getTotalPrice(this.long);
      const long_total = long_prices.reduce((a, b) => a + b, 0);

      this.q_long = Math.floor(this.long_amount / long_total);
      log('debug', 'Long equity: ', this.q_long);
    } catch(err) {
      log('error', 'Error while getting long total prices.', err.error);
    }

    try {
      const short_prices = await this.getTotalPrice(this.short);
      const short_total = short_prices.reduce((a, b) => a + b, 0);

      this.q_short = Math.floor(this.short_amount / short_total);
      log('debug', 'Short equity: ', this.q_short);
    } catch(err) {
      log('error', 'Error while getting short total prices.', err.error);
    }
  }

  /**
   * @description Get the total price of the array of input stocks
   * @param @{Array} stocks
   */
  async getTotalPrice(stocks = []) {
    log('debug', 'Getting total price of stocks:', stocks);
    return Promise.all(stocks.map(stock => new Promise(async (resolve) => {
      try {
        // polygon and alpaca have different responses to keep
        // backwards compatibility, so we handle it differently
        if(this.alpaca.configuration.usePolygon) {
          const now = new Date().getTime();
          const resp = await this.alpaca.getHistoricAggregatesV2(
            stock,
            1,
            'minute',
            // 60000 (minutes in milliseconds)
            // 1 + 1 (limit + 1, this will return exactly 1 sample)
            now - (1 + 1) * 60000,
            now,
            {adjusted: false},
          );
          const close = resp.results[0].c;
          resolve(close);
        } else {
          const resp = await this.alpaca.getBarsV2(stock, {
            timeframe: '1Min',
            limit: 1,
          });
          const bars = await generatorToArray(resp);
          if(bars.length === 0) {
            log('debug', {stock}, 'No bars found for stock');
          }
          resolve(bars.length ? bars[0].ClosePrice : 0);
        }
      } catch(err) {
        console.error(err);
        log('error', {stock}, 'Error while getting historical data for stock', err);
      }
    })));
  }

  /**
   * @description Submit an order if quantity is above 0
   * @param {number} quantity - amount of stock to purchase
   * @param {string} stock - stock symbol
   * @param {string} side - buy or sell
   */
  async submitOrder({quantity, stock, side}) {
    log('debug', {quantity, stock, side}, 'Submitting order...');
    return new Promise(async (resolve) => {
      if(quantity <= 0) {
        log('info', {quantity, stock, side}, 'Quantity is less than 0. Market order not sent.');
        resolve(true);
        return;
      }

      try {
        await this.alpaca.createOrder({
          symbol: stock,
          qty: quantity,
          side,
          type: 'market',
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
   * @description Submit a batch order that returns completed and uncompleted orders
   */
  async sendBatchOrder({quantity, stocks, side}) {
    log('debug', {quantity, stocks, side}, 'Sending batch order...');
    return new Promise(async (resolve) => {
      const incomplete = [];
      const executed = [];

      await Promise.all(stocks.map(stock => new Promise(async (res) => {
        if(!this.blacklist.has(stock)) {
          try {
            const is_submitted = await this.submitOrder({quantity, stock, side});
            if(is_submitted) {
              executed.push(stock);
            } else {
              incomplete.push(stock);
            }
          } catch(err) {
            log('error', 'Error while submitting order in sendBatchOrder', err.error);
          }
        }
        res();
      })));
      resolve({incomplete, executed});
    });
  }

  /**
   * @description Get percent changes of the stock prices over the last 10 minutes
   */
  async getPercentChanges(limit = 10) {
    log('debug', 'Getting percent changes...');
    return Promise.all(this.stock_list.map(stock => new Promise(async (resolve) => {
      try {
        // polygon and alpaca have different responses to keep backwards
        // compatibility, so we handle it a bit differently
        if(this.alpaca.configuration.usePolygon) {
          const now = new Date().getTime();
          const resp = await this.alpaca.getHistoricAggregatesV2(
            stock.name,
            1,
            'minute',
            // 60000 : minutes and in milliseconds
            // 1+1: limit + 1, this will return exactly limit samples
            now - (limit + 1) * 60000,
            now,
            {unadjusted: false},
          );
          const l = resp.results.length;
          const last_close = resp.results[l - 1].c;
          const first_open = resp.results[0].o;
          stock.pc = (last_close - first_open) / first_open;
        } else {
          const resp = await this.alpaca.getBarsV2(stock.name, {
            timeframe: '1Min',
            limit,
          });
          const bars = await generatorToArray(resp);
          if(bars.length > 0) {
            const last_close = bars[bars.length - 1].ClosePrice;
            const first_open = bars[0].OpenPrice;
            stock.pc = (last_close - first_open) / first_open;
          } else {
            // temporarily set to 0
            stock.pc = 0;
          }
        }
      } catch(err) {
        console.error(err);
        log('error', {stock: stock.name}, 'Error while getting percent change', err);
      }
      resolve();
    })));
  }
}

const longShortExample = new LongShort({keyId: APCA_API_KEY_ID, secretKey: APCA_API_SECRET_KEY});
const run = () => {
  log('warn', 'Running Long Short Example');
  longShortExample.run();
};

const name = () => 'Long Short Example';

module.exports = {run, name};
